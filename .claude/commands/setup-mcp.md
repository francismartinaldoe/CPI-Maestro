---
description: >
  Step-by-step MCP connection setup for new team members after git clone.
  Detects your current state (what's missing) and guides you through exactly
  what to run — nothing more, nothing less.
  Usage: /setup-mcp
---

Run a full MCP connection setup check and guide the team member through every step.

---

## Step 1 — Detect current state

Run all checks silently and collect results:

```bash
# Check 1: submodule initialised?
git submodule status 2>/dev/null | head -5

# Check 2: mcp/dist/index.js built?
python -c "import os; print('BUILT' if os.path.exists('mcp/dist/index.js') else 'NOT_BUILT')"

# Check 3: .env files exist?
python -c "
import os
from pathlib import Path
for label in ['dev','test','prod']:
    f = Path('mcp') / f'.env.{label}'
    if f.exists():
        content = f.read_text()
        filled = 'CPI_CLIENT_ID' in content and 'your_client_id' not in content.lower() and len([l for l in content.splitlines() if 'CPI_CLIENT_ID=' in l and l.split('=',1)[1].strip()]) > 0
        print(f'{label.upper()}: {\"FILLED\" if filled else \"EMPTY\"}')
    else:
        print(f'{label.upper()}: MISSING')
"

# Check 4: CPI servers registered in user settings?
python -c "
import json, os
settings = os.path.expanduser('~/.claude/settings.json')
if os.path.exists(settings):
    d = json.load(open(settings))
    servers = d.get('mcpServers', {})
    for s in ['CPI-DEV','CPI-TEST','CPI-PROD']:
        print(f'{s}: {\"REGISTERED\" if s in servers else \"MISSING\"}')
else:
    print('settings.json: NOT FOUND')
"

# Check 5: MCP actually responding?
# Will be checked by trying list_packages at the end
```

---

## Step 2 — Print personalised setup guide

Based on the checks above, print ONLY the steps the user still needs to do. Skip steps that are already complete. Always number from 1 regardless of which steps are needed.

Use this exact output format:

```
## MCP Setup Guide — {USERNAME}
Checked: {datetime}

{if submodule not init}
STEP {n} — Initialise the MCP submodule
  git submodule update --init --recursive

{if dist not built}
STEP {n} — Build the MCP server
  cd mcp && npm install && npm run build && cd ..

{if any .env missing or empty}
STEP {n} — Configure CPI credentials
  Copy the template and fill in your BTP Service Key values:
  cp mcp/.env.example mcp/.env.dev

  Then open mcp/.env.dev and fill in:
    CPI_TENANT_URL    = (from BTP Cockpit → Service Instances → Process Integration Runtime → Service Keys → url)
    CPI_TOKEN_URL     = (from tokenurl)
    CPI_CLIENT_ID     = (from clientid)
    CPI_CLIENT_SECRET = (from clientsecret)

  Repeat for mcp/.env.test and mcp/.env.prod if you have those tenants.

{if CPI servers not in user settings}
STEP {n} — Register CPI MCP servers in YOUR user settings
  Run these 3 commands (replace <YOUR-USERNAME> with YOUR Windows username):

  claude mcp add --scope user CPI-DEV --command node -- --env-file=C:/Users/<YOUR-USERNAME>/repos/CPIMAESTRO/mcp/.env.dev C:/Users/<YOUR-USERNAME>/repos/CPIMAESTRO/mcp/dist/index.js
  claude mcp add --scope user CPI-TEST --command node -- --env-file=C:/Users/<YOUR-USERNAME>/repos/CPIMAESTRO/mcp/.env.test C:/Users/<YOUR-USERNAME>/repos/CPIMAESTRO/mcp/dist/index.js
  claude mcp add --scope user CPI-PROD --command node -- --env-file=C:/Users/<YOUR-USERNAME>/repos/CPIMAESTRO/mcp/.env.prod C:/Users/<YOUR-USERNAME>/repos/CPIMAESTRO/mcp/dist/index.js

  WHY user settings? — Paths contain your username. Project settings must NOT have mcpServers
  (if they do, they shadow your entries and CPI agents stop working for everyone).

{always}
STEP {n} — Reload VS Code
  Press Ctrl+Shift+P → type "Developer: Reload Window" → Enter
  (MCP servers only start on VS Code load)

{always}
STEP {n} — Verify connection
  In Claude chat, type:
    @integration-detective list packages in DEV
  If it returns a list of packages → SUCCESS. CPI MCP is connected.
  If it returns an error → run /setup-mcp again to re-diagnose.
```

---

## Step 3 — JIRA setup reminder

Always append this after the CPI steps:

```
## JIRA MCP Setup

Run once to authenticate:
  python scripts/jira_auth_helper.py

  - If token is valid → exits silently (< 1 second)
  - If expired → silently refreshes via refresh token
  - First time → opens browser for SAP SSO login

NOTE: On corporate SAP network/VPN, CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1
is set automatically by Claude Code. Do NOT remove it — it is required by the
proxy. The jira_auth_helper.py PKCE flow works regardless of this flag.
```

---

## Step 4 — Final status

Run a live check to confirm CPI MCP works:
- Call `get_runtime_artifacts` on CPI-DEV
- If ≥1 artifact returned → print: `CPI MCP connected. You are ready to use all agents.`
- If error → print the specific error and re-run Steps 1–4

---

## Notes

- Run `/setup-mcp` any time you suspect MCP issues — it re-diagnoses and shows only what's needed
- The project `.claude/settings.json` intentionally has NO mcpServers block — each user manages their own
- Credentials stay in `mcp/.env.*` files — never committed to git (gitignored)
