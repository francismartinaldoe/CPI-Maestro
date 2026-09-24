"""
JIRA MCP OAuth Helper — smart token manager with silent refresh
Usage: python scripts/jira_auth_helper.py

Flow:
1. If saved token is still valid (> 2 min remaining) — use it, exit silently
2. If saved refresh token exists — use it to get a new access token silently (no browser)
3. If no refresh token or refresh fails — open browser for full SSO login

After first login, subsequent calls silently refresh without any browser interaction.
Token lasts 15 minutes; refresh token lasts much longer.
"""

import urllib.request, urllib.parse, json, secrets, hashlib, base64
import http.server, threading, os, sys, time
import subprocess

USERNAME = os.environ.get('USERNAME', os.environ.get('USER', 'user'))
TOKEN_PATH = os.path.expanduser('~/.claude/jira_oauth_token.json').replace('/', os.sep)
PENDING_PATH = os.path.expanduser('~/.claude/mcp_oauth_pending.json').replace('/', os.sep)
REDIRECT = 'http://localhost:12345/callback'
SILENT = '--silent' in sys.argv  # suppress output when called programmatically


def log(msg):
    if not SILENT:
        print(msg)


def load_saved_tokens():
    if not os.path.exists(TOKEN_PATH):
        return None
    try:
        with open(TOKEN_PATH) as f:
            tokens = json.load(f)
        # Check token file age — token TTL is 900s, we refresh if < 120s remaining
        age = time.time() - os.path.getmtime(TOKEN_PATH)
        ttl = tokens.get('expires_in', 900)
        tokens['_age'] = age
        tokens['_remaining'] = ttl - age
        return tokens
    except Exception:
        return None


def is_token_valid(tokens):
    """Token is valid if it has more than 2 minutes remaining."""
    return tokens and tokens.get('_remaining', 0) > 120


def refresh_token_silent(tokens):
    """Use refresh token to get a new access token without browser."""
    refresh = tokens.get('refresh_token')
    if not refresh:
        return None

    # Need client_id — load from pending or re-register
    client_id = None
    if os.path.exists(PENDING_PATH):
        try:
            with open(PENDING_PATH) as f:
                pending = json.load(f)
            client_id = pending.get('client_id')
        except Exception:
            pass

    if not client_id:
        # Re-register a new client for the refresh
        try:
            client_id = register_client()
        except Exception:
            return None

    data = urllib.parse.urlencode({
        'grant_type': 'refresh_token',
        'refresh_token': refresh,
        'client_id': client_id,
    }).encode()
    try:
        req = urllib.request.Request(
            'https://mcp.jira.<YOUR-DOMAIN>/token', data=data,
            headers={'Content-Type': 'application/x-www-form-urlencoded'})
        with urllib.request.urlopen(req, timeout=15) as r:
            new_tokens = json.loads(r.read().decode())
            # Preserve refresh token if not returned
            if 'refresh_token' not in new_tokens and refresh:
                new_tokens['refresh_token'] = refresh
            return new_tokens
    except Exception:
        return None


def verify_token(access_token):
    """Test the token works against the JIRA MCP."""
    try:
        payload = json.dumps({'jsonrpc':'2.0','id':1,'method':'tools/list','params':{}}).encode()
        req = urllib.request.Request('https://mcp.jira.<YOUR-DOMAIN>/mcp', data=payload,
            headers={'Content-Type':'application/json','Authorization':f'Bearer {access_token}',
                     'Accept':'application/json, text/event-stream'})
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status == 200
    except Exception:
        return False


def register_client():
    payload = json.dumps({
        'client_name': f'Claude Code {USERNAME}',
        'redirect_uris': [REDIRECT],
        'grant_types': ['authorization_code', 'refresh_token'],
        'response_types': ['code'],
        'token_endpoint_auth_method': 'none'
    }).encode()
    req = urllib.request.Request(
        'https://mcp.jira.<YOUR-DOMAIN>/register', data=payload,
        headers={'Content-Type': 'application/json', 'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode())['client_id']


def build_pkce():
    verifier = secrets.token_urlsafe(32)
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode()
    state = secrets.token_urlsafe(16)
    return verifier, challenge, state


def open_browser(url):
    if sys.platform == 'win32':
        subprocess.Popen(['powershell', '-Command', f'Start-Process "{url}"'])
    else:
        subprocess.Popen(['xdg-open', url])


def wait_for_callback(expected_state):
    result = {}

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            params = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            code = params.get('code', [None])[0]
            state = params.get('state', [None])[0]
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            if code and state == expected_state:
                self.wfile.write(b'<h1>Authenticated! You can close this tab.</h1>')
                result['code'] = code
            else:
                self.wfile.write(b'<h1>Error - state mismatch. Try again.</h1>')
            threading.Thread(target=self.server.shutdown).start()

        def log_message(self, *a):
            pass

    http.server.HTTPServer(('localhost', 12345), Handler).serve_forever()
    return result.get('code')


def exchange_token(client_id, code, verifier):
    data = urllib.parse.urlencode({
        'grant_type': 'authorization_code',
        'code': code,
        'redirect_uri': REDIRECT,
        'client_id': client_id,
        'code_verifier': verifier
    }).encode()
    req = urllib.request.Request(
        'https://mcp.jira.<YOUR-DOMAIN>/token', data=data,
        headers={'Content-Type': 'application/x-www-form-urlencoded'})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode())


def save_tokens(tokens):
    with open(TOKEN_PATH, 'w') as f:
        json.dump({k: v for k, v in tokens.items() if not k.startswith('_')}, f)


def full_browser_flow():
    """Full PKCE browser flow — only needed on first login or refresh token expiry."""
    log('Step 1/4 - Registering OAuth client...')
    client_id = register_client()
    log(f'  Client ID: {client_id[:20]}...')

    log('Step 2/4 - Building PKCE challenge...')
    verifier, challenge, state = build_pkce()

    with open(PENDING_PATH, 'w') as f:
        json.dump({'client_id': client_id, 'verifier': verifier, 'state': state, 'redirect': REDIRECT}, f)

    auth_url = (
        f'https://mcp.jira.<YOUR-DOMAIN>/authorize?response_type=code'
        f'&client_id={client_id}'
        f'&redirect_uri={urllib.parse.quote(REDIRECT)}'
        f'&state={state}'
        f'&code_challenge={challenge}'
        f'&code_challenge_method=S256'
        f'&scope=mcp'
    )

    log('Step 3/4 - Opening browser for SAP SSO login...')
    log(f'\n  SSO URL (copy-paste if browser does not open):\n  {auth_url}\n')
    open_browser(auth_url)
    log('  Waiting for callback on http://localhost:12345/callback ...')

    code = wait_for_callback(state)
    if not code:
        print('ERROR: No auth code received. Try again.')
        sys.exit(1)

    log('Step 4/4 - Exchanging code for token...')
    tokens = exchange_token(client_id, code, verifier)
    return tokens


def main():
    # Step 1 — check if existing token is still valid
    saved = load_saved_tokens()
    if is_token_valid(saved):
        remaining = int(saved['_remaining'])
        log(f'Token still valid ({remaining}s remaining) — no action needed.')
        return

    # Step 2 — try silent refresh with refresh token
    if saved and saved.get('refresh_token'):
        log('Token expired — attempting silent refresh...')
        new_tokens = refresh_token_silent(saved)
        if new_tokens and new_tokens.get('access_token'):
            if verify_token(new_tokens['access_token']):
                save_tokens(new_tokens)
                log('Token refreshed silently. No browser needed.')
                log(f'New token expires in: {new_tokens.get("expires_in", 900)}s')
                return
            else:
                log('Silent refresh succeeded but token verification failed — falling back to browser flow.')
        else:
            log('Silent refresh failed — opening browser for full login.')

    # Step 3 — full browser flow (first login or refresh token expired)
    tokens = full_browser_flow()
    save_tokens(tokens)
    log(f'\nJIRA MCP authenticated successfully!')
    log(f'   Expires: {tokens.get("expires_in", 900)} seconds')
    log(f'   Refresh token: {"yes" if tokens.get("refresh_token") else "no"}')
    log(f'   Token saved to: {TOKEN_PATH}')
    log(f'\nNext call will refresh silently — no browser needed.')


if __name__ == '__main__':
    main()
