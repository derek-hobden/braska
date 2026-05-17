#!/bin/bash
set -e

INPUT=$(cat)
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_response.file_path // .tool_input.file_path // empty')
[ -z "$FILE_PATH" ] && exit 0

case "$FILE_PATH" in
  */.claude/*) exit 0 ;;
  */CLAUDE.md) exit 0 ;;
  */.git/*|*/node_modules/*|*/dist/*|*/build/*|*/.next/*|*/.nuxt/*|*/.venv/*|*/venv/*|*/target/*|*/vendor/*|*/.cache/*) exit 0 ;;
esac

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
PARENT=$(dirname "$FILE_PATH")
BASENAME=$(basename "$FILE_PATH")

[ "$PARENT" = "$PROJECT_DIR" ] && exit 0

CMD="$PARENT/CLAUDE.md"

if [ -f "$CMD" ]; then
  BULLET=$(awk -v name="$BASENAME" '
    /^## Contents/ { in_section=1; next }
    /^## / && in_section { in_section=0 }
    in_section && /^- / {
      if (index($0, "`" name "`") > 0) {
        print
        exit
      }
    }
  ' "$CMD")

  if [ -n "$BULLET" ]; then
    MSG="An Edit just modified \`$FILE_PATH\`. Its sibling \`$CMD\` lists it with this bullet:

$BULLET

Verify the description is still accurate after the edit. If it no longer fits the file's purpose, update ONLY this bullet line in $CMD. Leave \`## Purpose\` and other bullets unchanged. If the description is still accurate, do nothing."
  else
    MSG="An Edit just modified \`$FILE_PATH\`. Its sibling \`$CMD\` exists but does not list \`$BASENAME\` in its \`## Contents\` section. Add a bullet for it now under \`## Contents\` using the format:

- \`$BASENAME\` — one-line description

Leave \`## Purpose\` and other bullets unchanged."
  fi
else
  MSG="An Edit just modified \`$FILE_PATH\`, but its parent folder (\`$PARENT\`) has no CLAUDE.md. The folder-sync hook will flag this on the next Write/Bash call. If you're mid-task, you can ignore this — it will be addressed automatically. Otherwise, create \`$PARENT/CLAUDE.md\` now with \`## Purpose\` and \`## Contents\` sections."
fi

jq -n --arg msg "$MSG" '{
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: $msg
  }
}'
