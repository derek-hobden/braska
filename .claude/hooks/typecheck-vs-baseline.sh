#!/bin/bash
# Utility (NOT auto-fired). Run this from project root after a typecheck pass to
# diff against the committed baseline of pre-existing errors. Useful in monorepos
# that carry inherited tsc errors so we only flag NEW regressions.
#
# Setup:
#   1. Run `npx tsc --noEmit 2>&1 | sort > .claude/state/typecheck-baseline.txt`
#      while the codebase is at the level of "errors we're tolerating today".
#   2. Commit `.claude/state/typecheck-baseline.txt`.
#   3. Run this script after subsequent typechecks to see only new errors:
#        npx tsc --noEmit 2>&1 | .claude/hooks/typecheck-vs-baseline.sh
#   4. To refresh the baseline (e.g. after intentional cleanup):
#        npx tsc --noEmit 2>&1 | sort > .claude/state/typecheck-baseline.txt
#
# Exit 0 = no new errors. Exit 1 = new errors detected (printed to stderr).

set -e

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
BASELINE="$PROJECT_DIR/.claude/state/typecheck-baseline.txt"

if [ ! -f "$BASELINE" ]; then
  echo "No baseline at $BASELINE — treating all current output as new." >&2
  echo "To establish a baseline: npx tsc --noEmit 2>&1 | sort > $BASELINE" >&2
  cat
  exit 1
fi

CURRENT=$(cat | sort)
NEW_ERRORS=$(comm -23 <(printf '%s\n' "$CURRENT") "$BASELINE")

if [ -z "$NEW_ERRORS" ]; then
  echo "✓ No new errors vs baseline (baseline: $BASELINE)" >&2
  exit 0
fi

echo "✗ New errors not in baseline:" >&2
echo "" >&2
printf '%s\n' "$NEW_ERRORS" >&2
echo "" >&2
echo "(baseline: $BASELINE — refresh with: <typecheck cmd> | sort > $BASELINE)" >&2
exit 1
