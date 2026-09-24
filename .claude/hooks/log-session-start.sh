#!/usr/bin/env bash
# .claude/hooks/log-session-start.sh
# Fires on UserPromptSubmit — logs session start with agent context.
# Safe — always exits 0, never blocks.

LOG_DIR="$(cd "$(dirname "$0")/../.." && pwd)/logs"
SESSION_LOG="$LOG_DIR/sessions.log"

mkdir -p "$LOG_DIR"

TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
USER_ID="${USERNAME:-${USER:-unknown}}"

# First 120 chars of the prompt for context (no sensitive content expected at this layer)
PROMPT_PREVIEW=$(echo "$CLAUDE_USER_PROMPT" | head -c 120 | tr '\n' ' ' || echo "")

echo "{\"ts\":\"$TS\",\"user\":\"$USER_ID\",\"event\":\"session_start\",\"prompt\":\"$PROMPT_PREVIEW\"}" >> "$SESSION_LOG"

exit 0
