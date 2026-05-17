#!/bin/bash
set -e

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
INPUT=$(cat)

FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_response.file_path // .tool_input.file_path // ""')
SESSION_ID=$(printf '%s' "$INPUT" | jq -r '.session_id // ""')

WIP="$PROJECT_DIR/work-in-progress.html"
BRANCH=$(cd "$PROJECT_DIR" 2>/dev/null && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

is_default() {
  case "$1" in main|master|develop|trunk|"") return 0 ;; *) return 1 ;; esac
}

is_default "$BRANCH" && exit 0
[ ! -f "$WIP" ] && exit 0

# If the edit landed on the WIP file itself, run the validator and exit.
# Validator: every <ul> inside the Tasks section must carry class="check".
# Strip HTML comments first so example <ul> inside <!-- ... --> blocks don't false-trigger.
if [ "$FILE_PATH" = "$WIP" ]; then
  STRIPPED=$(perl -0777 -pe 's/<!--.*?-->//gs' "$WIP" 2>/dev/null || cat "$WIP")
  TASKS_BLOCK=$(printf '%s' "$STRIPPED" | awk '/<h2>Tasks<\/h2>/{flag=1; next} flag && /<h2>/{flag=0} flag')
  if [ -n "$TASKS_BLOCK" ]; then
    BAD_UL=$(printf '%s\n' "$TASKS_BLOCK" | grep -nE '<ul([> ]|$)' | grep -vF '<ul class="check"' || true)
    if [ -n "$BAD_UL" ]; then
      VIOLATION_MSG="work-in-progress.html VALIDATION FAILED: the Tasks section contains a <ul> without class=\"check\". Every <ul> inside <h2>Tasks</h2> (including every nested sub-<ul> under a task <li>) MUST carry class=\"check\" so checkboxes render. Offending occurrence(s) (line numbers are within the comment-stripped Tasks block):

${BAD_UL}

Fix in your next edit: change <ul> to <ul class=\"check\">."
      jq -n --arg msg "$VIOLATION_MSG" '{
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext: $msg
        }
      }'
    fi
  fi
  exit 0
fi

WIP_AGE_SEC=$(( $(date +%s) - $(stat -f %m "$WIP" 2>/dev/null || stat -c %Y "$WIP" 2>/dev/null || date +%s) ))
DEBOUNCE_SEC=30
[ "$WIP_AGE_SEC" -lt "$DEBOUNCE_SEC" ] && exit 0

WIP_AGE_MIN=$(( WIP_AGE_SEC / 60 ))

# Full rules ONCE per session, digest after. Marker file holds the session_id
# of the session for which full rules were last shown.
STATE_DIR="$PROJECT_DIR/.claude/state"
RULES_MARKER="$STATE_DIR/wip-rules-shown"
SHOW_FULL=1
if [ -n "$SESSION_ID" ] && [ -f "$RULES_MARKER" ] && [ "$(cat "$RULES_MARKER" 2>/dev/null)" = "$SESSION_ID" ]; then
  SHOW_FULL=0
fi

if [ "$SHOW_FULL" -eq 1 ]; then
  mkdir -p "$STATE_DIR"
  [ -n "$SESSION_ID" ] && printf '%s' "$SESSION_ID" > "$RULES_MARKER"
  RULES_BLOCK="FULL UPDATE RULES (shown once per session, digest after):
1. Tick subtasks class=\"done\" when story verified AND any referenced test passes.
2. Advance the class=\"active\" marker — exactly one active subtask across the whole file.
3. Update the <p class=\"status\"> line whenever a milestone advances OR a subtask is deferred. Status reflects TRUTH; never round up; flag deferrals.
4. DEFERRALS: mark class=\"deferred\" with inline <em>Deferred YYYY-MM-DDTHH:MMZ — reason; revisit when …</em> AND add a Follow-ups entry. Never silently leave pending or fudge as done.
5. CASCADE COMPLETION: when every direct child of a parent <li> is class=\"done\" OR class=\"deferred\", mark the parent class=\"done\" too, recursively upward.
6. SIZE DISCIPLINE: once a milestone goes done, fold its nested <ul class=\"check\"> in <details><summary>Milestone X — name (N done[, M deferred]) — anchor <commit></summary>...</details>.
7. TASKS LIST: every <ul> inside the Tasks section MUST carry class=\"check\" (including every nested sub-<ul> under a task <li>). No bare <ul>. This hook flags any bare <ul> in Tasks on the next edit.
8. After every milestone, add an Anchor commit entry under Runbook.
9. QUESTIONS: Questions section holds Q&A pair blocks. APPEND new questions at the bottom of <div class=\"qna\">; when answering an existing question, MUTATE its .q block in place — fill in the <p class=\"answer\">, add <time class=\"answered\">YYYY-MM-DDTHH:MMZ</time>, drop the \"open\" class. Never delete a resolved question. Decisions section is for a-priori choices that were NOT first raised as a question.
10. Add Decisions / Don'ts / Course corrections / Subagent notes when relevant. Remove picked-up Follow-ups (with a Decisions entry, or a mutated Q&A pair if it was a Question).
11. ORDERING: every timelined section (Anchor commits, Questions [new ones only], Decisions, Don'ts, Course corrections, Subagent notes, Follow-ups) is ASCENDING chronological — APPEND at the BOTTOM, never prepend. EXCEPTION: in Questions, answering an existing open question is an in-place mutation, not a re-order.
12. TIMESTAMPS: every timestamp in this file uses YYYY-MM-DDTHH:MMZ (UTC, no seconds). Run \`date -u +\"%Y-%m-%dT%H:%MZ\"\` to get the current value.
13. NEVER rewrite the Original prompt section."
else
  RULES_BLOCK="WIP rules: Tick done • Advance active • Update status • Defer with reason + Follow-up • Cascade parents • Fold completed milestones • Anchor commits • Tasks <ul> class=\"check\" always • Questions append; answer in place (never delete) • Timestamps YYYY-MM-DDTHH:MMZ everywhere • Ascending order • Never touch Original prompt. (Full rules: see this hook script — shown once per session at first fire.)"
fi

MSG="An edit just landed on \`$FILE_PATH\`. work-in-progress.html was last updated ${WIP_AGE_MIN}m ago. If this edit advanced the work meaningfully — completed a subtask, took a decision, hit a snag, changed approach, answered an open question in the Questions section, learned something worth remembering — update \`$WIP\` now to reflect it.

${RULES_BLOCK}

Skip the update only if this edit was truly mechanical (typo, formatting) and changed nothing about the task state."

jq -n --arg msg "$MSG" '{
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: $msg
  }
}'
