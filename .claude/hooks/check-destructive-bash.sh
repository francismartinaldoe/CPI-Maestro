#!/bin/bash
# Intercept destructive Bash commands and ask for confirmation.
# Returns permissionDecision=ask if the command matches a destructive pattern.

input=$(cat)

# Use python to extract the command (jq not available in all environments)
cmd=$(echo "$input" | python -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('command', ''))
except:
    print('')
")

# Normalise: lowercase for case-insensitive matching
cmd_lower=$(echo "$cmd" | tr '[:upper:]' '[:lower:]')

is_destructive=false
reason=""

# File/directory deletion
if echo "$cmd_lower" | grep -qE '(^|[;&|])\s*(rm\s|rm$|del\s|del$|rmdir\s|rmdir$|rd\s|rd$|unlink\s)'; then
  is_destructive=true; reason="file/directory deletion (rm/del/rmdir/rd/unlink)"
fi

# Git destructive operations
if echo "$cmd_lower" | grep -qE 'git\s+(reset\s+--hard|clean\s+-|push\s+--force|push\s+-f\b|branch\s+-[dD]\s|tag\s+-d\s)'; then
  is_destructive=true; reason="destructive git operation (reset --hard / clean / force-push / branch -D)"
fi

# Disk / filesystem operations
if echo "$cmd_lower" | grep -qE '(^|[;&|])\s*(mkfs|dd\s|format\s|diskpart|fdisk|parted\s|shred\s|wipe\s)'; then
  is_destructive=true; reason="disk/filesystem operation (mkfs/dd/format/shred)"
fi

# Database destructive SQL
if echo "$cmd_lower" | grep -qE '(drop\s+(table|database|schema)|truncate\s+table)'; then
  is_destructive=true; reason="destructive SQL (DROP TABLE/DATABASE or TRUNCATE)"
fi

# Overwrite via truncate
if echo "$cmd_lower" | grep -qE '(^|[;&|])\s*truncate\s+-s\s+0'; then
  is_destructive=true; reason="file truncation (truncate -s 0)"
fi

# npm/yarn destructive
if echo "$cmd_lower" | grep -qE '(^|[;&|])\s*(npx\s+rimraf\s|npm\s+run\s+nuke|yarn\s+nuke)'; then
  is_destructive=true; reason="destructive npm/yarn operation (rimraf/nuke)"
fi

if [ "$is_destructive" = "true" ]; then
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"Destructive command detected (%s) — please confirm."}}\n' "$reason"
fi
