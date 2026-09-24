#!/bin/bash
# Block ALL git push operations — always require explicit user confirmation
# Covers: git push, GH_HOST=... git push, cd ... && git push, chained commands

input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // ""')

# Match any git push pattern regardless of prefix (env vars, cd, chaining)
if echo "$command" | grep -qE 'git\s+push'; then
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"BLOCKED: git push requires explicit user confirmation — this applies to ALL repositories including public. Ask the user first, then push with a separate command after receiving explicit confirmation."}}\n'
fi
# Block any git commit that stages .env.local or .env
if echo "$command" | grep -qE 'git\s+(add|commit)'; then
    if echo "$command" | grep -qE '\.env(\.local)?'; then
        printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"BLOCKED: .env.local and .env are machine-local credentials — never commit them to git. They are gitignored for this reason."}}
'
        exit 0
    fi
fi
