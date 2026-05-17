#!/bin/bash
set -e

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
cat >/dev/null

STATE_DIR="$PROJECT_DIR/.claude/state"
STATE_FILE="$STATE_DIR/folder-sync-state.txt"

list_children() {
  local dir="$1"
  find "$dir" -mindepth 1 -maxdepth 1 \
    \( \
      -name CLAUDE.md -o -name .DS_Store -o -name Thumbs.db \
      -o -name .git -o -name .svn -o -name .hg \
      -o -name node_modules -o -name dist -o -name build -o -name out \
      -o -name .next -o -name .nuxt \
      -o -name .venv -o -name venv -o -name __pycache__ \
      -o -name target -o -name vendor \
      -o -name .cache -o -name .idea -o -name .vscode -o -name .fleet \
      -o -name .parcel-cache -o -name coverage -o -name .nyc_output \
      -o -name .claude \
      -o -name .turbo -o -name .swc \
      -o -name '*.tsbuildinfo' -o -name .eslintcache -o -name .stylelintcache \
    \) -prune \
    -o -print 2>/dev/null \
  | while IFS= read -r entry; do
      [ "$entry" = "$dir" ] && continue
      name=$(basename "$entry")
      if [ -d "$entry" ]; then
        printf '%s/\n' "$name"
      else
        printf '%s\n' "$name"
      fi
    done | sort -u
}

# Compute fingerprint per folder: listing-hash + claude.md-hash. If neither
# changed since last fire, exit silently — that's the delta-driven gate.
compute_state() {
  while IFS= read -r d; do
    [ "$d" = "$PROJECT_DIR" ] && continue
    lhash=$(list_children "$d" | shasum -a 256 | cut -c1-12)
    chash=""
    [ -f "$d/CLAUDE.md" ] && chash=$(shasum -a 256 "$d/CLAUDE.md" | cut -c1-12)
    printf '%s|%s|%s\n' "$d" "$lhash" "$chash"
  done < <(
    find "$PROJECT_DIR" \
      \( -type d \( -name .git -o -name node_modules -o -name .claude -o -name dist -o -name build -o -name out -o -name .next -o -name .nuxt -o -name .venv -o -name venv -o -name __pycache__ -o -name target -o -name vendor -o -name .cache -o -name .idea -o -name .vscode -o -name .fleet -o -name .parcel-cache -o -name coverage -o -name .nyc_output -o -name .turbo -o -name .swc \) \) -prune \
      -o -type d -print 2>/dev/null
  )
}

NEW_STATE=$(compute_state)
NEW_HASH=$(printf '%s' "$NEW_STATE" | shasum -a 256 | cut -c1-12)
OLD_HASH=""
[ -f "$STATE_FILE" ] && OLD_HASH=$(head -c 12 "$STATE_FILE" 2>/dev/null)

if [ "$NEW_HASH" = "$OLD_HASH" ]; then
  exit 0
fi

mkdir -p "$STATE_DIR"
{ printf '%s\n' "$NEW_HASH"; printf '%s' "$NEW_STATE"; } > "$STATE_FILE"

# State changed — do the full scan and produce the report.

MISSING=""
STALE=""
PRUNE_CMDS=""

while IFS= read -r d; do
  [ "$d" = "$PROJECT_DIR" ] && continue

  if [ ! -f "$d/CLAUDE.md" ]; then
    MISSING="${MISSING}  - ${d}"$'\n'
    continue
  fi

  actual=$(list_children "$d")

  declared=$(awk '
    /^## Contents/ { in_section=1; next }
    /^## / && in_section { in_section=0 }
    in_section && /^- / && match($0, /`[^`]+`/) {
      print substr($0, RSTART+1, RLENGTH-2)
    }
  ' "$d/CLAUDE.md" | sort -u)

  declared_literals=$(printf '%s' "$declared" | grep -v '[*?[]' || true)
  declared_globs=$(printf '%s' "$declared" | grep '[*?[]' || true)

  unmatched_actual=""
  while IFS= read -r entry; do
    [ -z "$entry" ] && continue
    if printf '%s\n' "$declared_literals" | grep -Fxq "$entry"; then
      continue
    fi
    matched=0
    while IFS= read -r glob; do
      [ -z "$glob" ] && continue
      case "$entry" in
        $glob) matched=1; break ;;
      esac
    done <<< "$declared_globs"
    [ "$matched" -eq 0 ] && unmatched_actual="${unmatched_actual}${entry}"$'\n'
  done <<< "$actual"

  unmatched_declared_literals=""
  while IFS= read -r entry; do
    [ -z "$entry" ] && continue
    if ! printf '%s\n' "$actual" | grep -Fxq "$entry"; then
      unmatched_declared_literals="${unmatched_declared_literals}${entry}"$'\n'
    fi
  done <<< "$declared_literals"

  unused_globs=""
  while IFS= read -r glob; do
    [ -z "$glob" ] && continue
    has_match=0
    while IFS= read -r entry; do
      [ -z "$entry" ] && continue
      case "$entry" in
        $glob) has_match=1; break ;;
      esac
    done <<< "$actual"
    [ "$has_match" -eq 0 ] && unused_globs="${unused_globs}${glob}"$'\n'
  done <<< "$declared_globs"

  if [ -n "$unmatched_actual" ] || [ -n "$unmatched_declared_literals" ] || [ -n "$unused_globs" ]; then
    actual_block=$(printf '%s' "$actual" | sed 's/^/    * /')
    declared_block=$(printf '%s' "$declared" | sed 's/^/    * /')

    drift_actual_block=""
    [ -n "$unmatched_actual" ] && drift_actual_block=$(printf '%s' "$unmatched_actual" | sed 's/^/    + /')
    drift_declared_block=""
    [ -n "$unmatched_declared_literals" ] && drift_declared_block=$(printf '%s' "$unmatched_declared_literals" | sed 's/^/    - /')
    drift_globs_block=""
    [ -n "$unused_globs" ] && drift_globs_block=$(printf '%s' "$unused_globs" | sed 's/^/    ~ /')

    if [ -n "$unmatched_declared_literals" ]; then
      while IFS= read -r entry; do
        [ -z "$entry" ] && continue
        esc=$(printf '%s' "$entry" | sed 's/[\/&|]/\\&/g')
        PRUNE_CMDS="${PRUNE_CMDS}sed -i.bak '/\`${esc}\`/d' '${d}/CLAUDE.md' && rm '${d}/CLAUDE.md.bak'"$'\n'
      done <<< "$unmatched_declared_literals"
    fi

    STALE="${STALE}
- ${d}/CLAUDE.md
  Actual direct children (truth):
${actual_block:-    (none)}
  Currently listed in ## Contents (literals + globs):
${declared_block:-    (none)}
  Drift detail:
${drift_actual_block:+    (+) actual entries NOT covered by any declared literal or glob:$'\n'$drift_actual_block$'\n'}${drift_declared_block:+    (-) declared literals with NO matching actual entry (REMOVE these):$'\n'$drift_declared_block$'\n'}${drift_globs_block:+    (~) declared globs that match NOTHING in actual:$'\n'$drift_globs_block$'\n'}"
  fi
done < <(
  find "$PROJECT_DIR" \
    \( -type d \( -name .git -o -name node_modules -o -name .claude -o -name dist -o -name build -o -name out -o -name .next -o -name .nuxt -o -name .venv -o -name venv -o -name __pycache__ -o -name target -o -name vendor -o -name .cache -o -name .idea -o -name .vscode -o -name .fleet -o -name .parcel-cache -o -name coverage -o -name .nyc_output -o -name .turbo -o -name .swc \) \) -prune \
    -o -type d -print 2>/dev/null
)

[ -z "$MISSING" ] && [ -z "$STALE" ] && exit 0

MSG="Folder documentation needs attention."

if [ -n "$MISSING" ]; then
  MSG="${MSG}

=== MISSING CLAUDE.md ===
These folders have no CLAUDE.md:
${MISSING}
Create \`<folder>/CLAUDE.md\` for each, using EXACTLY this format:

## Purpose
<1-3 short lines on WHY this folder exists — its role, what belongs here, how it fits the system>

## Contents
- \`name.ext\` — one-line description
- \`subfolder/\` — one-line description (trailing slash on folders)

You may use GLOB entries for repetitive file groups (e.g., \`*.test.ts\` — unit tests for sibling modules) — the parser supports them. But every actual file must be covered by at least one literal OR glob entry, and every glob must match at least one actual file. Direct children only (not recursive). Exclude CLAUDE.md itself and any of these noise entries: .git, .claude, node_modules, dist, build, out, .next, .nuxt, .venv, venv, __pycache__, target, vendor, .cache, .idea, .vscode, .fleet, .parcel-cache, coverage, .nyc_output, .turbo, .swc, *.tsbuildinfo, .eslintcache, .stylelintcache, .DS_Store, Thumbs.db."
fi

if [ -n "$STALE" ]; then
  MSG="${MSG}

=== STALE CLAUDE.md ===
These folders' \`## Contents\` lists do not match the actual direct children. The Drift detail block under each shows exactly what's wrong:
  (+) entries that exist on disk but no declared literal or glob covers them — ADD them
  (-) declared literals that no longer exist on disk — REMOVE them (auto-prune commands provided below)
  (~) declared globs that match nothing — these are dangling, REMOVE them

Edit each CLAUDE.md to fix only the Drift items. Preserve the \`## Purpose\` section unchanged. Glob entries are valid (e.g., \`*.test.ts\`); they just need to actually match files.
${STALE}"
  if [ -n "$PRUNE_CMDS" ]; then
    MSG="${MSG}
=== AUTO-PRUNE COMMANDS (for declared-but-missing entries) ===
You can run these to auto-remove dropped entries (review first; they delete bullets matching the backticked name):

${PRUNE_CMDS}"
  fi
  MSG="${MSG}
Rules: use backticks around names; trailing slash on folder names matching the truth listing exactly; do not include CLAUDE.md in Contents; do not modify any CLAUDE.md not listed above."
fi

jq -n --arg msg "$MSG" '{
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: $msg
  }
}'
