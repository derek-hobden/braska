#!/bin/bash
set -e

INPUT=$(cat)

TOOL_NAME=$(printf '%s' "$INPUT" | jq -r '.tool_name // ""')
[ "$TOOL_NAME" != "Agent" ] && exit 0

# Capture the subagent's report (capped to keep this hook cheap).
RESPONSE=$(printf '%s' "$INPUT" \
  | jq -r '.tool_response // .tool_response.text // .tool_response.report // .tool_response.summary // ""' \
  | head -c 8000)

# A trustworthy subagent report contains EITHER:
#   - concrete counts: "folders: N", "files: M", "wrote N", "processed M"
#   - an explicit "deferred" / "skipped" / "no work needed" sentinel
# Anything else (planning text, "I would do X", "next I'll...") is a tell-tale
# of a subagent that planned but didn't execute.
if printf '%s' "$RESPONSE" | grep -qiE '\b(folders?|dirs?|directories|files?|entries|wrote|created|processed|updated|edited|examined)\b[: =]*[0-9]+|\b(deferred|skipped|no work needed|nothing to do|already done)\b'; then
  exit 0
fi

# Truncate response for the warning so we don't dump huge text into context.
RESPONSE_PREVIEW=$(printf '%s' "$RESPONSE" | head -c 600)

jq -n --arg agent "$TOOL_NAME" --arg preview "$RESPONSE_PREVIEW" '{
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: ("⚠️  SUBAGENT VERIFICATION FAILED — the just-completed Agent did NOT report concrete counts (e.g. \"folders: N / files: M\") or a \"deferred\"/\"skipped\" sentinel. This is the textbook subagent failure mode: planning text returned without actually doing the work.\n\nFirst 600 chars of the report:\n---\n" + $preview + "\n---\n\nBefore trusting the result:\n  1. Run a quick filesystem check (e.g. `find <touched-path> -newer .claude/state/last-touch | wc -l`) to verify files were actually written.\n  2. If 0 / far less than expected, RE-INVOKE the same subagent with explicit framing:\n     \"EXECUTE NOW. At end of run report concrete counts in this exact format:\n        folders processed: N\n        files written: M\n        deferred: K (with one-line reason each)\n      Failure to provide these counts means rework is required.\"\n  3. If counts still do not materialize after the re-invoke, switch to a different agent type or do the work in the main thread.")
  }
}'
