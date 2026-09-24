#!/usr/bin/env bash
# UserPromptSubmit hook: fires on every prompt
# 1. Detects first-time clone / MCP not configured → prompts /setup-mcp
# 2. Wider team: auto-pull when behind
# 3. Core team: informational question — never force-pull

git rev-parse --git-dir > /dev/null 2>&1 || exit 0

# Resolve repo root (works with both Git Bash and absolute Windows paths)
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
[ -z "$REPO_ROOT" ] && exit 0

# ── MCP health check — detect missing setup ──────────────────────────────────
MCP_ISSUES=""

# Check mcp/dist/index.js exists
if [ ! -f "$REPO_ROOT/mcp/dist/index.js" ]; then
  MCP_ISSUES="mcp/dist/index.js missing (run: cd mcp && npm install && npm run build)"
fi

# Check at least .env.dev exists and has content
if [ ! -f "$REPO_ROOT/mcp/.env.dev" ] || [ ! -s "$REPO_ROOT/mcp/.env.dev" ]; then
  MCP_ISSUES="${MCP_ISSUES:+${MCP_ISSUES}; }mcp/.env.dev missing or empty (copy from mcp/.env.example and fill BTP credentials)"
fi

# Check CPI servers registered in user settings OR Claude Desktop config
if command -v python &>/dev/null || command -v python3 &>/dev/null; then
  PY=$(command -v python || command -v python3)
  CPI_REG=$($PY -c "
import json,os,sys

def load_servers(path):
    if not os.path.exists(path): return {}
    try: return json.load(open(path)).get('mcpServers',{})
    except: return {}

# Check ~/.claude/settings.json (claude mcp add --scope user)
user_settings = load_servers(os.path.expanduser('~/.claude/settings.json'))

# Check %APPDATA%/Claude/claude_desktop_config.json (Claude Desktop / VS Code extension)
appdata = os.environ.get('APPDATA','')
desktop_config = load_servers(os.path.join(appdata,'Claude','claude_desktop_config.json'))

# Merge both — server is registered if it appears in either
all_servers = set(user_settings.keys()) | set(desktop_config.keys())

missing=[x for x in ['CPI-DEV','CPI-TEST'] if x not in all_servers]
print(','.join(missing) if missing else 'OK')
" 2>/dev/null)
  if [ "$CPI_REG" != "OK" ] && [ -n "$CPI_REG" ]; then
    MCP_ISSUES="${MCP_ISSUES:+${MCP_ISSUES}; }CPI servers not registered in ~/.claude/settings.json: ${CPI_REG}"
  fi
fi

if [ -n "$MCP_ISSUES" ]; then
  cat <<JSON
{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"MCP-SETUP-REQUIRED: CPI MCP not fully configured — ${MCP_ISSUES}. Run /setup-mcp for step-by-step guidance."}}
JSON
  exit 0
fi

# ── Git sync check ────────────────────────────────────────────────────────────
git fetch origin --quiet 2>/dev/null

LOCAL=$(git rev-parse HEAD 2>/dev/null)
REMOTE=$(git rev-parse origin/main 2>/dev/null)
[ -z "$REMOTE" ] && REMOTE=$(git rev-parse origin/master 2>/dev/null)

[ -z "$LOCAL" ] || [ -z "$REMOTE" ] && exit 0
[ "$LOCAL" = "$REMOTE" ] && exit 0

BEHIND=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo "?")
COMMITS=$(git log --oneline HEAD..origin/main 2>/dev/null | head -5 | tr '\n' ' ')

if [ "${CORE_TEAM}" = "1" ]; then
  cat <<JSON
{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"-GIT-SYNC: Your workspace is ${BEHIND} commit(s) behind origin/main (${COMMITS}). Would you like to run git pull before proceeding with this prompt?"}}
JSON
else
  PULL_OUTPUT=$(git pull --ff-only origin main 2>&1)
  PULL_EXIT=$?
  if [ $PULL_EXIT -eq 0 ]; then
    cat <<JSON
{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"-GIT-SYNC: Auto-pulled ${BEHIND} commit(s) from origin/main. Workspace is now current."}}
JSON
  else
    cat <<JSON
{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"-GIT-SYNC: Workspace is ${BEHIND} commit(s) behind origin/main but auto-pull failed — ${PULL_OUTPUT}"}}
JSON
  fi
fi
