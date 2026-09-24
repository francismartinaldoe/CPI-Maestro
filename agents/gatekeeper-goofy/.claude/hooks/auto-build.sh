#!/bin/bash
# auto-build.sh — Rebuild dist/ whenever a .ts file in src/ is edited.
# Fires as a PostToolUse hook after Edit or Write tool calls.

input=$(cat)

# Extract the file path that was written/edited
file_path=$(echo "$input" | python -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('tool_input', {}).get('file_path', ''))
except:
    print('')
" 2>/dev/null)

# Only rebuild if a TypeScript source file changed
if echo "$file_path" | grep -qE '\.ts$'; then
  echo "🔨 TypeScript file changed: $file_path — rebuilding dist/..."
  cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
  npm run build 2>&1
  if [ $? -eq 0 ]; then
    echo "✅ Build succeeded — dist/ is up to date."
  else
    echo "❌ Build failed — check TypeScript errors above."
  fi
fi
