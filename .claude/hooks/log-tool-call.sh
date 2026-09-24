#!/usr/bin/env bash
# .claude/hooks/log-tool-call.sh
# Fires after every MCP tool call (PostToolUse).
# Logs: timestamp, tool name, tenant, iFlow/artifact, user.
# Safe — never blocks the tool call, always exits 0.

LOG_DIR="$(cd "$(dirname "$0")/../.." && pwd)/logs"
LOG_FILE="$LOG_DIR/agent-audit.log"
PROD_LOG="$LOG_DIR/prod-access.log"

mkdir -p "$LOG_DIR"

TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
TOOL="${CLAUDE_TOOL_NAME:-unknown}"
USER_ID="${USERNAME:-${USER:-unknown}}"

# Extract tenant from tool input env vars or tool name
TENANT="unknown"
if echo "$CLAUDE_TOOL_INPUT" | grep -qi "PROD"; then
  TENANT="PROD"
elif echo "$CLAUDE_TOOL_INPUT" | grep -qi "TEST"; then
  TENANT="TEST"
elif echo "$CLAUDE_TOOL_NAME" | grep -qi ".CPI.PROD"; then
  TENANT="PROD"
elif echo "$CLAUDE_TOOL_NAME" | grep -qi ".CPI.TEST"; then
  TENANT="TEST"
else
  TENANT="DEV"
fi

# Extract iFlow/artifact name from tool input if present
ARTIFACT=$(echo "$CLAUDE_TOOL_INPUT" | grep -oP '"(iflowName|artifactId|artifactName|iflowId)"\s*:\s*"\K[^"]+' | head -1 || echo "")

# Write to main audit log
echo "{\"ts\":\"$TS\",\"user\":\"$USER_ID\",\"tool\":\"$TOOL\",\"tenant\":\"$TENANT\",\"artifact\":\"$ARTIFACT\"}" >> "$LOG_FILE"

# Write to PROD-specific log if PROD tenant
if [ "$TENANT" = "PROD" ]; then
  echo "{\"ts\":\"$TS\",\"user\":\"$USER_ID\",\"tool\":\"$TOOL\",\"tenant\":\"PROD\",\"artifact\":\"$ARTIFACT\"}" >> "$PROD_LOG"
fi

exit 0
