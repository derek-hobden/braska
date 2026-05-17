#!/bin/bash
set -e

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
cat >/dev/null

WIP="$PROJECT_DIR/work-in-progress.html"
BRANCH=$(cd "$PROJECT_DIR" 2>/dev/null && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

is_default() {
  case "$1" in main|master|develop|trunk|"") return 0 ;; *) return 1 ;; esac
}

if is_default "$BRANCH" || [ ! -f "$WIP" ]; then
  exit 0
fi

WIP_AGE_MIN=$(( ($(date +%s) - $(stat -f %m "$WIP" 2>/dev/null || stat -c %Y "$WIP" 2>/dev/null || date +%s)) / 60 ))
STALE_THRESHOLD=10

if [ "$WIP_AGE_MIN" -gt "$STALE_THRESHOLD" ]; then
  jq -n --arg age "$WIP_AGE_MIN" --arg wip "$WIP" '{
    decision: "block",
    reason: ("Compaction blocked: work-in-progress.html (" + $wip + ") has not been updated in " + $age + " minutes. Compaction will lose context that is not captured there. Ask Claude to update work-in-progress.html first (tick completed subtasks, advance the active marker, log recent decisions and in-flight state), then retry /compact. To bypass, temporarily disable this hook in .claude/settings.json.")
  }'
  exit 0
fi

exit 0
