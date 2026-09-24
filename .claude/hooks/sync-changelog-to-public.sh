#!/bin/bash
# PostToolUse hook — fires after every Bash tool call.
# Checks if the just-run command was a git commit touching CHANGELOG.md.
# If yes, copies CHANGELOG.md to public and commits+pushes there.
# Skips silently if PUBLIC_REPO is not set or repo is not cloned.

input=$(cat)

# Only act on git commit commands
cmd=$(echo "$input" | python -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('command', ''))
except:
    print('')
")

# Must be a git commit command
if ! echo "$cmd" | grep -qE 'git\s+commit'; then
  exit 0
fi

# Must be in theClaude repo
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
if [ ! -f "$REPO_ROOT/CHANGELOG.md" ]; then
  exit 0
fi

# Check CHANGELOG.md was part of the last commit
if ! git -C "$REPO_ROOT" diff --name-only HEAD~1 HEAD 2>/dev/null | grep -q "CHANGELOG.md"; then
  exit 0
fi

# Check PUBLIC_REPO is set
if [ -z "$PUBLIC_REPO" ]; then
  echo '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"⚠ CHANGELOG.md was committed but PUBLIC_REPO is not set. Run /_tech-update to set up the public repo."}}'
  exit 0
fi

# Check the public repo exists
if [ ! -d "$PUBLIC_REPO/.git" ]; then
  echo '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"⚠ PUBLIC_REPO is set but directory not found. Run /_tech-update to re-clone."}}'
  exit 0
fi

# Pull latest from public repo first
git -C "$PUBLIC_REPO" pull --ff-only --quiet 2>/dev/null

# Copy CHANGELOG.md into changelog/ subfolder
mkdir -p "$PUBLIC_REPO/changelog"
cp "$REPO_ROOT/CHANGELOG.md" "$PUBLIC_REPO/changelog/CHANGELOG.md"

# Commit and push
cd "$PUBLIC_REPO"
git add changelog/CHANGELOG.md

if git diff --cached --quiet; then
  exit 0  # No changes — already up to date
fi

git commit -m "sync: update CHANGELOG.md fromClaude" --quiet
git push origin main --quiet

echo '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"✓ CHANGELOG.md synced to public changelog."}}'
