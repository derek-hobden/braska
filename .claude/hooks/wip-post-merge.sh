#!/bin/bash
set -e

# Fires after a `git switch <default>` / `git checkout <default>` Bash call.
# If a work-in-progress.html still exists with promotable content (Decisions,
# Don'ts, Course corrections, or answered Questions), emits a non-blocking
# nudge recommending /wip-promote. Quiet by default — debounced once per
# unique WIP content hash so the same un-promoted file doesn't nudge twice.

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
INPUT=$(cat)

CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""')
[ -z "$CMD" ] && exit 0

# Match git switch <default> / git checkout <default>. Default branch set:
# main, master, develop, trunk. Allow flags (-q, --quiet, etc.) between the
# subcommand and the branch name.
if ! printf '%s' "$CMD" | grep -qE '(^|[^[:alnum:]_])git[[:space:]]+(switch|checkout)[[:space:]]+(-[^[:space:]]+[[:space:]]+)*(main|master|develop|trunk)([[:space:]]|$)'; then
  exit 0
fi

# Defence: verify we are actually now on a default branch (rules out e.g.
# `git checkout main -- somefile.txt` which doesn't switch branches).
BRANCH=$(cd "$PROJECT_DIR" 2>/dev/null && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
case "$BRANCH" in
  main|master|develop|trunk) ;;
  *) exit 0 ;;
esac

WIP="$PROJECT_DIR/work-in-progress.html"
[ ! -f "$WIP" ] && exit 0

# Check for at least one substantive promotable item in any of:
#   Decisions, Don'ts, Course corrections, answered Questions.
# Each section is bounded by its <h2> and the next <h2>. Walk once per section.
has_section_entries() {
  local heading_pattern="$1"
  local entry_pattern="$2"
  awk -v h="$heading_pattern" -v e="$entry_pattern" '
    $0 ~ h { flag=1; next }
    flag && /<h2>/ { exit }
    flag && $0 ~ e { print "yes"; exit }
  ' "$WIP" | grep -q yes
}

if ! has_section_entries '<h2>Decisions</h2>' '<div class="entry">' \
   && ! has_section_entries '<h2>Don.*ts /' '<div class="entry dont">' \
   && ! has_section_entries '<h2>Course corrections' '<div class="entry">' \
   && ! has_section_entries '<h2>Questions</h2>' '<div class="q">'; then
  exit 0
fi

# Content-hash debounce — same WIP content stays quiet after the first nudge.
if command -v sha256sum >/dev/null 2>&1; then
  HASH=$(sha256sum "$WIP" | awk '{print $1}')
else
  HASH=$(shasum -a 256 "$WIP" | awk '{print $1}')
fi

STATE_DIR="$PROJECT_DIR/.claude/state"
MARKER="$STATE_DIR/wip-nudge-shown-$HASH"
[ -f "$MARKER" ] && exit 0

mkdir -p "$STATE_DIR"
touch "$MARKER"

MSG="You just switched to default branch \`$BRANCH\`, but \`$WIP\` still exists with promotable content (Decisions, Don'ts, Course corrections, or answered Questions captured during this branch's work). Run \`/wip-promote\` to graduate items into ADRs (\`docs/adr/\`), \`## Gotchas\` sections of the relevant CLAUDE.md, or \`## Language\` entries — before the WIP gets lost or stale.

This nudge stays quiet until the WIP content actually changes (sha256-hash debounce), so feel free to ignore once and address it on the next prompt cycle."

jq -n --arg msg "$MSG" '{
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: $msg
  }
}'
