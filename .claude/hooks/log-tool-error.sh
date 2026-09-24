#!/usr/bin/env bash
# .claude/hooks/log-tool-error.sh
# Fires after a tool call that resulted in an error (PostToolUse with non-zero exit).
# Logs 403/401/500 errors for security monitoring.
# Safe — always exits 0.

LOG_DIR="$(cd "$(dirname "$0")/../.." && pwd)/logs"
ERROR_LOG="$LOG_DIR/tool-errors.log"

mkdir -p "$LOG_DIR"

# Only log if tool output contains error indicators
if echo "$CLAUDE_TOOL_RESULT" | grep -qiE "403|401|500|unauthorized|forbidden|error"; then
  TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  TOOL="${CLAUDE_TOOL_NAME:-unknown}"
  USER_ID="${USERNAME:-${USER:-unknown}}"

  # Determine error type
  ERROR_CODE="unknown"
  if echo "$CLAUDE_TOOL_RESULT" | grep -q "403"; then ERROR_CODE="403"; fi
  if echo "$CLAUDE_TOOL_RESULT" | grep -q "401"; then ERROR_CODE="401"; fi
  if echo "$CLAUDE_TOOL_RESULT" | grep -q "500"; then ERROR_CODE="500"; fi

  # Extract error message (first 200 chars, redact any key-like patterns)
  ERROR_MSG=$(echo "$CLAUDE_TOOL_RESULT" | head -c 200 | \
    sed 's/[A-Za-z0-9_\-]\{20,\}\$[A-Za-z0-9_\-]\{10,\}/[REDACTED]/g' | \
    tr '\n' ' ')

  echo "{\"ts\":\"$TS\",\"user\":\"$USER_ID\",\"tool\":\"$TOOL\",\"error_code\":\"$ERROR_CODE\",\"message\":\"$ERROR_MSG\"}" >> "$ERROR_LOG"
fi

exit 0
