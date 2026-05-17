#!/bin/bash
set -e

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
cat >/dev/null

SOURCE="${1:-startup}"
WIP="$PROJECT_DIR/work-in-progress.html"
BRANCH=$(cd "$PROJECT_DIR" 2>/dev/null && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

is_default() {
  case "$1" in main|master|develop|trunk|"") return 0 ;; *) return 1 ;; esac
}

if [ -f "$WIP" ]; then
  WIP_AGE=$(( ($(date +%s) - $(stat -f %m "$WIP" 2>/dev/null || stat -c %Y "$WIP" 2>/dev/null || date +%s)) / 60 ))
  MSG="A work-in-progress.html exists at \`$WIP\` for branch \`$BRANCH\` (last updated ${WIP_AGE}m ago). READ IT FIRST — it is the durable workplan across sessions and subagents. READING ORDER for fastest orientation: (1) <p class=\"status\"> line at top (one-line current state); (2) Runbook (how to run/test/verify, anchor commits); (3) the class=\"active\" subtask in Tasks — that is the exact resume point; (4) Questions (open ones first — class=\"open\") and Don'ts; (5) recent Course corrections and Decisions. UPDATE RULES as you work: tick completed subtasks class=\"done\"; advance class=\"active\" to the next in-progress one (exactly one active at a time); update the <p class=\"status\"> line when a milestone advances; add Anchor commits under Runbook when a milestone verifies; add new Decisions / Don'ts / Course corrections / Subagent notes as they arise; Questions section — APPEND new questions at the bottom, MUTATE IN PLACE to answer (fill in <p class=\"answer\">, add <time class=\"answered\">YYYY-MM-DDTHH:MMZ</time>, drop \"open\" class; never delete a resolved question). Every Tasks <ul> (including nested sub-<ul>) MUST carry class=\"check\". SUBTASK STATES: class=\"active\" (one only) / class=\"done\" / class=\"deferred\" (with <em>Deferred YYYY-MM-DDTHH:MMZ — reason</em> inline + Follow-ups entry) / no class (pending). CASCADE COMPLETION: when every direct child of a parent <li> is class=\"done\" OR class=\"deferred\", mark the parent class=\"done\" too, recursively upward — deferred counts as resolved for cascade. SIZE DISCIPLINE: completed milestone <li>s fold their nested <ul class=\"check\"> inside <details><summary>Milestone X — name (N done[, M deferred]) — anchor <commit></summary>...</details>. STATUS LINE must reflect TRUTH — never round up; always flag deferrals. TIMESTAMPS everywhere use YYYY-MM-DDTHH:MMZ (UTC, no seconds). ORDERING: every timelined section (Anchor commits, Questions [new ones only], Decisions, Don'ts, Course corrections, Subagent notes, Follow-ups) is ASCENDING chronological — APPEND new entries at the BOTTOM, never prepend; the latest entry is the LAST one in its section. EXCEPTION: in Questions, answering an existing open question is an in-place mutation, not a re-order. NEVER rewrite the Original prompt section."
else
  if is_default "$BRANCH"; then
    exit 0
  fi
  MSG="You are on branch \`$BRANCH\` and there is no work-in-progress.html yet. When the user submits their first prompt this session, create \`$WIP\` capturing the prompt verbatim plus your plan. (The UserPromptSubmit hook will inject the prompt text and a full template at that moment — wait for it.) work-in-progress.html is gitignored; ensure \`work-in-progress.html\` is in \`.gitignore\` when you create it."
fi

jq -n --arg msg "$MSG" '{
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: $msg
  }
}'
