#!/bin/bash
set -e

# PreToolUse hook: runs on Bash calls; if the call is a `git commit`, scans
# staged files for hardcoded credentials (DENY), staged .env files (DENY),
# and debug-logging matches (NUDGE-only). Non-commit Bash calls exit silently.

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
INPUT=$(cat)

CMD=$(printf '%s' "$INPUT" | jq -r '.tool_input.command // ""')
[ -z "$CMD" ] && exit 0

# Match `git commit` anywhere in the command (handles `cd src && git commit`).
if ! printf '%s' "$CMD" | grep -qE '(^|[^[:alnum:]_/])git[[:space:]]+commit\b'; then
  exit 0
fi

cd "$PROJECT_DIR" 2>/dev/null || exit 0

# Staged files (added/copied/modified — skip deletions).
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null || true)
[ -z "$STAGED_FILES" ] && exit 0

# Source files only, for credential and debug-log scans.
STAGED_SRC=$(printf '%s\n' "$STAGED_FILES" | grep -E '\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|rb|java|cs|swift|kt|cpp|c|sh|bash|zsh|lua|sql)$' || true)

NL=$'\n'

# --- Check 1: staged .env* files (DENY) -------------------------------------
ENV_HITS=$(printf '%s\n' "$STAGED_FILES" \
  | grep -E '(^|/)\.env(\.[^.]+)?$' \
  | grep -vE '\.(example|sample|template)$' \
  || true)

# --- Check 2: hardcoded credentials (DENY) ----------------------------------
CRED_HITS=""
if [ -n "$STAGED_SRC" ]; then
  KEY_NAMES='(password|api_key|apikey|secret|access_token|auth_token|client_secret|private_key)'
  DQ_PAT="${KEY_NAMES}[[:space:]]*[:=][[:space:]]*\"[^\"]{6,}\""
  SQ_PAT="${KEY_NAMES}[[:space:]]*[:=][[:space:]]*'[^']{6,}'"

  while IFS= read -r f; do
    [ -z "$f" ] && continue
    [ ! -f "$f" ] && continue
    HITS=$(grep -nIE "$DQ_PAT|$SQ_PAT" "$f" 2>/dev/null \
      | grep -vE '\$\{|process\.env\.|os\.environ\.|os\.getenv\(|config\.' \
      | grep -vE '^[0-9]+:[[:space:]]*([#/]|//)' \
      || true)
    if [ -n "$HITS" ]; then
      CRED_HITS="${CRED_HITS}${f}:${NL}${HITS}${NL}${NL}"
    fi
  done <<< "$STAGED_SRC"
fi

# --- Check 3: debug logging (NUDGE-only) ------------------------------------
DEBUG_HITS=""
if [ -n "$STAGED_SRC" ]; then
  DEBUG_PAT='console\.(log|debug|warn)|print\(|fmt\.Print'

  while IFS= read -r f; do
    [ -z "$f" ] && continue
    [ ! -f "$f" ] && continue
    case "$f" in *.test.*|*_test.*) continue ;; esac

    RAW=$(grep -nIE "$DEBUG_PAT" "$f" 2>/dev/null || true)
    [ -z "$RAW" ] && continue

    FILTERED=""
    while IFS= read -r hit; do
      [ -z "$hit" ] && continue
      LINENUM=$(printf '%s' "$hit" | cut -d: -f1)
      case "$LINENUM" in
        ''|*[!0-9]*) FILTERED="${FILTERED}${hit}${NL}"; continue ;;
      esac
      PREV=$((LINENUM - 1))
      if [ "$PREV" -lt 1 ]; then
        FILTERED="${FILTERED}${hit}${NL}"
        continue
      fi
      PREV_LINE=$(sed -n "${PREV}p" "$f" 2>/dev/null || true)
      # Strip leading whitespace, then strip a `//` or `#` comment prefix.
      # Use @ as the s/// delimiter to avoid clashing with the `|` alternation in the second pattern.
      STRIPPED=$(printf '%s' "$PREV_LINE" | sed -E 's@^[[:space:]]*@@; s@^(//|#)[[:space:]]*@@')
      case "$STRIPPED" in
        claude-allow-log*) ;;  # suppressed by opt-out marker
        *) FILTERED="${FILTERED}${hit}${NL}" ;;
      esac
    done <<< "$RAW"

    if [ -n "$FILTERED" ]; then
      DEBUG_HITS="${DEBUG_HITS}${f}:${NL}${FILTERED}${NL}"
    fi
  done <<< "$STAGED_SRC"
fi

# --- Compose response -------------------------------------------------------

if [ -n "$CRED_HITS" ] || [ -n "$ENV_HITS" ]; then
  REASON="Commit blocked by commit-checks hook.${NL}${NL}"
  if [ -n "$ENV_HITS" ]; then
    REASON="${REASON}.env* files MUST NOT be committed:${NL}${ENV_HITS}${NL}${NL}If this is a template, rename it to .env.example / .env.sample / .env.template and unstage the live one (\`git rm --cached <file>\`).${NL}${NL}"
  fi
  if [ -n "$CRED_HITS" ]; then
    REASON="${REASON}Hardcoded credential pattern detected:${NL}${CRED_HITS}Move secrets to environment variables or a secrets manager (\`process.env.X\`, \`os.environ['X']\`, \`os.getenv('X')\`, etc.). To bypass for a known false positive (e.g. a fixture), refactor the literal so the key-name pattern no longer matches.${NL}${NL}"
  fi
  if [ -n "$DEBUG_HITS" ]; then
    REASON="${REASON}Also noted (would be a non-blocking nudge if seen alone): debug-logging matches in:${NL}${DEBUG_HITS}"
  fi

  jq -n --arg reason "$REASON" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $reason
    }
  }'
  exit 0
fi

if [ -n "$DEBUG_HITS" ]; then
  MSG="commit-checks: debug-logging matches in staged files. Commit proceeds, but verify these are intentional:${NL}${NL}${DEBUG_HITS}${NL}Suppress per-line by adding \`// claude-allow-log\` (or \`# claude-allow-log\` for Python/Ruby/Shell) on the preceding line."

  jq -n --arg msg "$MSG" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: $msg
    }
  }'
  exit 0
fi

exit 0
