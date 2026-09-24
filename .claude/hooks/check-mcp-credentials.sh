#!/usr/bin/env bash
# check-mcp-credentials.sh
# Runs on SessionStart — detects unconfigured CPI credentials and warns per tenant
#
# DEV  — required: @flowlens-ai, @archflow, @integration-detective, @gatekeeper-goofy, @c3
# TEST — optional: @integration-detective (TEST), @gatekeeper-goofy (DEV vs TEST comparison)
# PROD — optional: @integration-detective (PROD), @gatekeeper-goofy (PROD comparisons)

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
[ -z "$REPO_ROOT" ] && exit 0

is_empty() {
    local FILE="$1"
    [ ! -f "$FILE" ] && return 0
    grep -qE "^CPI_CLIENT_ID=$|^CPI_CLIENT_SECRET=$|^CPI_TENANT_URL=$" "$FILE" 2>/dev/null
}

MSG=""

# DEV — required
if is_empty "$REPO_ROOT/mcp/.env.dev"; then
    MSG+="⚠️ mcp/.env.dev not configured — ALL CPI agents will not work."$'\n'
    MSG+="   Agents affected: @flowlens-ai, @archflow, @integration-detective, @gatekeeper-goofy, @c3-cutover-command-center"$'\n'
    MSG+="   Fix: open $REPO_ROOT/mcp/.env.dev → fill credentials from BTP Cockpit → restart VS Code"$'\n\n'
fi

# TEST — optional, targeted warning
if is_empty "$REPO_ROOT/mcp/.env.test"; then
    MSG+="ℹ️  mcp/.env.test not configured (optional)."$'\n'
    MSG+="   Agents affected: @integration-detective (TEST tenant), @gatekeeper-goofy (DEV vs TEST comparison)"$'\n'
    MSG+="   Fix: open $REPO_ROOT/mcp/.env.test → fill credentials from BTP Cockpit → restart VS Code"$'\n\n'
fi

# PROD — optional, targeted warning
if is_empty "$REPO_ROOT/mcp/.env.prod"; then
    MSG+="ℹ️  mcp/.env.prod not configured (optional)."$'\n'
    MSG+="   Agents affected: @integration-detective (PROD tenant), @gatekeeper-goofy (PROD comparisons)"$'\n'
    MSG+="   Fix: open $REPO_ROOT/mcp/.env.prod → fill credentials from BTP Cockpit → restart VS Code"$'\n\n'
fi

[ -z "$MSG" ] && exit 0

MSG+="Reference: ONBOARDING.md → Step 4"

printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' \
    "$(echo "$MSG" | sed 's/"/\\"/g' | tr '\n' '|' | sed 's/|/\\n/g')"


