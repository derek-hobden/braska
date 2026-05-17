#!/bin/bash
set -e

INPUT=$(cat)
CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""')

[ -z "$CMD" ] && exit 0

REASON=""

match() {
  local pattern="$1"
  local why="$2"
  if [ -z "$REASON" ] && printf '%s' "$CMD" | grep -qE "$pattern"; then
    REASON="$why"
  fi
}

# Recursive rm — the case that bit us
match '(^|[^[:alnum:]_])rm[[:space:]]+([^|;&]*[[:space:]])?(-[a-zA-Z]*[rR]|--recursive)' \
  "Recursive 'rm' deletes folder trees and is irreversible."

# rm with -f on absolute path (force, even non-recursive, on system paths)
match '(^|[^[:alnum:]_])rm[[:space:]]+([^|;&]*[[:space:]])?-[a-zA-Z]*f[a-zA-Z]*[[:space:]]+/' \
  "'rm -f' on an absolute path bypasses safety prompts."

# find with -delete or -exec rm
match '(^|[^[:alnum:]_])find\b[^|;&]*(-delete\b|-(exec|execdir)[[:space:]]+rm\b)' \
  "'find -delete' / 'find -exec rm' deletes files in bulk."

# git reset --hard
match '(^|[^[:alnum:]_])git[[:space:]]+reset\b[^|;&]*[[:space:]]--hard\b' \
  "'git reset --hard' discards uncommitted changes."

# git clean -f
match '(^|[^[:alnum:]_])git[[:space:]]+clean\b[^|;&]*[[:space:]]-[a-zA-Z]*f' \
  "'git clean -f' deletes untracked files."

# git push --force (any variant)
match '(^|[^[:alnum:]_])git[[:space:]]+push\b[^|;&]*([[:space:]]--force(-with-lease)?\b|[[:space:]]-[a-zA-Z]*f([[:space:]]|$))' \
  "'git push --force' rewrites remote history."

# git branch -D (capital D = force delete)
match '(^|[^[:alnum:]_])git[[:space:]]+branch\b[^|;&]*[[:space:]]-D\b' \
  "'git branch -D' force-deletes a branch with possibly unmerged commits."

# git checkout/restore that discards working-tree changes
match '(^|[^[:alnum:]_])git[[:space:]]+(checkout|restore)[[:space:]]+(\.|--[[:space:]]+\.|--$|--[[:space:]]*$)' \
  "'git checkout/restore .' discards working-tree changes."

# git stash drop / clear
match '(^|[^[:alnum:]_])git[[:space:]]+stash[[:space:]]+(drop|clear)\b' \
  "'git stash drop/clear' permanently removes stashed work."

# git commit --amend on shared history (heuristic; flag any --amend so user sees it)
match '(^|[^[:alnum:]_])git[[:space:]]+commit\b[^|;&]*[[:space:]]--amend\b' \
  "'git commit --amend' rewrites the previous commit."

# git rebase (history rewrite)
match '(^|[^[:alnum:]_])git[[:space:]]+rebase\b' \
  "'git rebase' rewrites commit history."

# truncate to zero
match '(^|[^[:alnum:]_])truncate\b[^|;&]*[[:space:]]-s[[:space:]]+0\b' \
  "'truncate -s 0' empties a file."

# dd writing to disk
match '(^|[^[:alnum:]_])dd[[:space:]]+([^|;&]*[[:space:]])?of=' \
  "'dd of=...' writes raw bytes and can destroy filesystems."

# shred / mkfs
match '(^|[^[:alnum:]_])(shred|mkfs(\.[a-z0-9]+)?)\b' \
  "Low-level destructive command (shred/mkfs)."

# rm -rf style via xargs
match '(^|[^[:alnum:]_])xargs\b[^|;&]*[[:space:]]rm\b' \
  "'xargs rm' deletes files in bulk based on piped input."

if [ -n "$REASON" ]; then
  jq -n --arg cmd "$CMD" --arg reason "$REASON" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: ("Destructive command guard:\n" + $reason + "\n\nCommand: " + $cmd)
    }
  }'
fi

exit 0
