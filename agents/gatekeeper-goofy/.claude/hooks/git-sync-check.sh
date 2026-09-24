#!/bin/bash
# git-sync-check.sh — Check if the local branch is behind origin on every prompt.
# Fires as a UserPromptSubmit hook.

cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# Silently fetch to check remote state (no output on success)
git fetch origin main --quiet 2>/dev/null

LOCAL=$(git rev-parse HEAD 2>/dev/null)
REMOTE=$(git rev-parse origin/main 2>/dev/null)

if [ "$LOCAL" = "" ] || [ "$REMOTE" = "" ]; then
  exit 0  # Not a git repo or no remote — skip silently
fi

if [ "$LOCAL" != "$REMOTE" ]; then
  BEHIND=$(git rev-list HEAD..origin/main --count 2>/dev/null)
  if [ "$BEHIND" -gt 0 ]; then
    echo "⚠️  Your branch is $BEHIND commit(s) behind origin/main."
    echo "   Run: git pull --ff-only origin main"
    echo "   Then run: npm run build"
  fi
fi
