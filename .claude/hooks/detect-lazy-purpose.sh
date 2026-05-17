#!/bin/bash
set -e

INPUT=$(cat)

FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_response.file_path // .tool_input.file_path // ""')
case "$FILE_PATH" in
  */CLAUDE.md) ;;
  *) exit 0 ;;
esac

[ ! -f "$FILE_PATH" ] && exit 0

# Extract the body of the ## Purpose section.
PURPOSE=$(awk '
  /^## Purpose/ { in_section=1; next }
  /^## / && in_section { in_section=0 }
  in_section { print }
' "$FILE_PATH" | tr -s '[:space:]' ' ' | sed 's/^ //;s/ $//')

FOLDER_NAME=$(basename "$(dirname "$FILE_PATH")")
LAZY_REASONS=""

# Heuristic 0: empty Purpose
if [ -z "$PURPOSE" ]; then
  LAZY_REASONS="${LAZY_REASONS}
  - The ## Purpose section is empty."
else
  PURPOSE_LEN=${#PURPOSE}
  PURPOSE_WORDS=$(printf '%s' "$PURPOSE" | wc -w | tr -d ' ')

  # Heuristic 1: too short
  if [ "$PURPOSE_LEN" -lt 40 ]; then
    LAZY_REASONS="${LAZY_REASONS}
  - Purpose is only ${PURPOSE_LEN} characters (threshold: 40)."
  fi

  # Heuristic 2: stub-phrase prefix
  case "$PURPOSE" in
    "Top-level route segment"*|"top-level route segment"*) \
      LAZY_REASONS="${LAZY_REASONS}
  - Begins with stub phrase \"Top-level route segment\" — name-derived fallback." ;;
    "Sub-folder"*|"sub-folder"*|"Subfolder"*|"subfolder"*) \
      LAZY_REASONS="${LAZY_REASONS}
  - Begins with stub phrase \"Sub-folder\" — name-derived fallback." ;;
    "Route segment"*|"route segment"*) \
      LAZY_REASONS="${LAZY_REASONS}
  - Begins with stub phrase \"Route segment\" — name-derived fallback." ;;
    "Sub-directory"*|"Subdirectory"*) \
      LAZY_REASONS="${LAZY_REASONS}
  - Begins with stub phrase \"Sub-directory\" — name-derived fallback." ;;
    "Folder for "*|"Directory for "*|"Contains "*) \
      LAZY_REASONS="${LAZY_REASONS}
  - Begins with stub phrase (\"Folder for…\"/\"Directory for…\"/\"Contains…\") — describes structure not purpose." ;;
  esac

  # Heuristic 3: Purpose ≈ folder name + filler (≤4 words AND mentions folder name)
  if [ "$PURPOSE_WORDS" -le 4 ] && printf '%s' "$PURPOSE" | grep -qiF "$FOLDER_NAME"; then
    LAZY_REASONS="${LAZY_REASONS}
  - Purpose is essentially just the folder name (\"${FOLDER_NAME}\") with ${PURPOSE_WORDS} words total — no real description."
  fi
fi

[ -z "$LAZY_REASONS" ] && exit 0

PURPOSE_PREVIEW=$(printf '%s' "$PURPOSE" | head -c 200)

jq -n --arg f "$FILE_PATH" --arg r "$LAZY_REASONS" --arg p "$PURPOSE_PREVIEW" '{
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: ("⚠️  LAZY PURPOSE detected in `" + $f + "`.\n\nReasons:" + $r + "\n\nCurrent Purpose: \"" + $p + "\"\n\nThis is the tell-tale sign of a name-derived fallback (auto-generated from the folder name with no real understanding). Rewrite the ## Purpose section with 1-3 lines that answer:\n  - What is this folder FOR?\n  - What kinds of files / responsibilities live here?\n  - How does it fit the broader system?\n\nIf this CLAUDE.md was written by a subagent, AUTO-DISPATCH a polish subagent now: spawn an Agent (general-purpose or Explore) with this exact prompt:\n\n  \"Read the actual files in `" + ($f | sub("/CLAUDE.md$";"")) + "`. Rewrite ONLY the ## Purpose section of `" + $f + "` with concrete, file-grounded language. Preserve ## Contents exactly. At end of run report: original_chars: N → new_chars: M.\"\n\nDo not accept another lazy stub from the polish pass — if the rewrite still trips this detector, escalate to the user.")
  }
}'
