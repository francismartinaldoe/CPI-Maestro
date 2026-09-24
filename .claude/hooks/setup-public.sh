#!/bin/bash
# Sets up the public repo locally and registers its path in settings.local.json.
# Run automatically by /_tech-update if PUBLIC_REPO is not set.
# Safe to run multiple times — idempotent.

set -e

REPO_URL="https://github.<YOUR-DOMAIN>/YOUR-ORG/YOUR-PUBLIC-REPO.git"
SETTINGS_LOCAL="$(git rev-parse --show-toplevel)/.claude/settings.local.json"

# Determine clone target — sibling ofClaude: ~/Public
CLONE_TARGET="$HOME/Public"

# ── 1. Clone if not already present ────────────────────────────────────────
if [ ! -d "$CLONE_TARGET/.git" ]; then
  echo "Cloning public to $CLONE_TARGET ..."
  git clone "$REPO_URL" "$CLONE_TARGET"
else
  echo "public already cloned at $CLONE_TARGET — skipping clone."
fi

# ── 2. Register path in settings.local.json ────────────────────────────────
# Normalise path to forward slashes for consistency across Windows/bash
NORM_PATH=$(echo "$CLONE_TARGET" | sed 's|\\|/|g')

if [ ! -f "$SETTINGS_LOCAL" ]; then
  # Create minimal settings.local.json
  printf '{\n  "env": {\n    "PUBLIC_REPO": "%s"\n  }\n}\n' "$NORM_PATH" > "$SETTINGS_LOCAL"
  echo "Created $SETTINGS_LOCAL with PUBLIC_REPO=$NORM_PATH"
else
  # Check if PUBLIC_REPO already set
  if python -c "
import json, sys
d = json.load(open('$SETTINGS_LOCAL'))
env = d.get('env', {})
if 'PUBLIC_REPO' in env:
    sys.exit(0)
else:
    sys.exit(1)
" 2>/dev/null; then
    echo "PUBLIC_REPO already set in settings.local.json — skipping."
  else
    # Add PUBLIC_REPO to existing env block (or create env block)
    python - "$SETTINGS_LOCAL" "$NORM_PATH" <<'PYEOF'
import json, sys
path = sys.argv[1]
value = sys.argv[2]
d = json.load(open(path))
d.setdefault('env', {})['PUBLIC_REPO'] = value
open(path, 'w').write(json.dumps(d, indent=2))
print(f"Added PUBLIC_REPO={value} to {path}")
PYEOF
  fi
fi

echo "✓ public setup complete. Path: $CLONE_TARGET"
