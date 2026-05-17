#!/bin/bash
set -e

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
INPUT=$(cat)

CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""')
[ -z "$CMD" ] && exit 0

if ! printf '%s' "$CMD" | grep -qE '(^|[^[:alnum:]_])git[[:space:]]+(checkout([[:space:]]+-b)?|switch([[:space:]]+-c)?|worktree[[:space:]]+add)\b'; then
  exit 0
fi

WIP="$PROJECT_DIR/work-in-progress.html"
BRANCH=$(cd "$PROJECT_DIR" 2>/dev/null && git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

is_default() {
  case "$1" in main|master|develop|trunk|"") return 0 ;; *) return 1 ;; esac
}

if is_default "$BRANCH" || [ -f "$WIP" ]; then
  exit 0
fi

MSG="A branch/worktree command just ran (\`$CMD\`). The current branch is \`$BRANCH\` and no work-in-progress.html exists for it. If real work is starting on this branch, create \`$WIP\` now. The full template + instructions are injected by the UserPromptSubmit hook on the user's next prompt — wait for that and follow it exactly. The file MUST include: <p class=\"status\"> one-line state header, Original prompt, Referenced files, Runbook (Run / Test / Verify / Anchor commits), Plan, Questions (Q&A pair blocks in <div class=\"qna\">), Tasks (with <ul class=\"check\"> — including every nested sub-<ul> — and user-story + test-ref per subtask, exactly one class=\"active\"), Decisions, Don'ts, Course corrections, Subagent notes. SUBTASK STATES: active / done / deferred (with inline <em>Deferred YYYY-MM-DDTHH:MMZ — reason</em> + Follow-ups entry) / pending. CASCADE COMPLETION rule: when every direct child of a parent <li> is class=\"done\" OR class=\"deferred\", mark the parent class=\"done\" too (recursively). SIZE DISCIPLINE: fold completed milestones in <details><summary>Milestone X — name (N done[, M deferred])</summary>...</details>. STATUS LINE must reflect TRUTH — flag deferrals, never round up. TIMESTAMPS everywhere use YYYY-MM-DDTHH:MMZ (UTC, no seconds). ORDERING: every timelined section (Anchor commits, Questions [new ones only], Decisions, Don'ts, Course corrections, Subagent notes, Follow-ups) is ASCENDING chronological — APPEND new entries at the BOTTOM, never prepend. EXCEPTION: in Questions, answering an existing open question is an in-place mutation, not a re-order. Add \`work-in-progress.html\` to \`$PROJECT_DIR/.gitignore\` if not already present. If this branch switch was just a quick check, you can ignore this nudge."

jq -n --arg msg "$MSG" '{
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: $msg
  }
}'
