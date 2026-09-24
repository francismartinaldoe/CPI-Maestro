#!/bin/bash
# Protect core files — allow only core team members (CORE_TEAM=1) to modify

input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // ""')

# Normalize backslashes to forward slashes
fp=$(echo "$file_path" | tr '\\' '/')

# Hard block: .env.local must NEVER be written by AI under any circumstance
case "$fp" in
  */.env.local|*/.env)
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":".env.local is machine-local and must never be written by AI or committed to git. Fill it in manually from .env.local.example."}}
'
    exit 0
    ;;
esac

is_protected=false

case "$fp" in
  *CLAUDE.md|*README.md|*ONBOARDING.md)   is_protected=true ;;
  */.claude/agents/*)                      is_protected=true ;;
  */.claude/commands/*)                    is_protected=true ;;
  */.claude/hooks/*)                       is_protected=true ;;
  *//*)                                is_protected=true ;;
esac

if [ "$is_protected" = "true" ]; then
    if [ "${CORE_TEAM}" = "1" ]; then
        printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"Core team member authorized"}}\n'
    else
        printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Protected file — core team only. Raise a change request to the repo owner."}}\n'
    fi
fi
