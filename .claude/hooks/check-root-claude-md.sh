#!/bin/bash
set -e

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
cat >/dev/null

ROOT_CLAUDE="$PROJECT_DIR/CLAUDE.md"

[ -f "$ROOT_CLAUDE" ] && exit 0

children=$(
  find "$PROJECT_DIR" -mindepth 1 -maxdepth 1 \
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
      name=$(basename "$entry")
      [ "$entry" = "$PROJECT_DIR" ] && continue
      if [ -d "$entry" ]; then
        printf '  - %s/\n' "$name"
      else
        printf '  - %s\n' "$name"
      fi
    done | sort -u
)

MSG="The project root has no CLAUDE.md. Before doing anything else this session:

1. Determine what this project IS. Read \`package.json\` (name, description, dependencies), any README, top-level config files (e.g., \`vite.config.*\`, \`tsconfig.json\`, \`Cargo.toml\`, \`pyproject.toml\`), and the top-level file/folder structure for signals.
2. If the project's purpose is NOT clear from those signals, STOP and ask the user a single short question — for example: \"What is this project? One sentence is fine — I'll write it into the root CLAUDE.md.\" Wait for the answer before proceeding.
3. Once the purpose is clear, create \`$ROOT_CLAUDE\` using EXACTLY this constitution-style format:

## Purpose
<1-3 short lines: what this project IS, what it does, who or what it serves.>

## Contents
<one bullet per direct child shown in the truth listing below>

## Stack
| Tool | Purpose |
|------|---------|
<!-- One row per non-trivial dependency: language/runtime, framework, database, package manager, key libraries.
     Fill in from package.json / Cargo.toml / pyproject.toml / go.mod / etc. -->

## Architecture
<!-- 3-6 sentences on how subsystems fit together. Reference top-level folders by name.
     E.g.: \"The \`server/\` subsystem exposes HTTP. \`client/\` consumes it via the generated API client in \`packages/api-client/\`. State lives in Postgres, accessed only through repository modules under \`server/db/\`.\" -->

## Naming Conventions
<!-- Project-wide naming rules: camelCase / PascalCase / kebab-case for files, types, variables.
     How concepts are named system-wide. Subsystem-specific overrides go in the subsystem's CLAUDE.md. -->

## Engineering Principles
<!-- Project's stance on DRY / SOLID / KISS / YAGNI. Brief and opinionated.
     Defer specifics to per-folder Internal Patterns and ADRs. -->

## Architecture Decision Records
ADRs live in \`docs/adr/\`. Numbered sequentially (\`0001-slug.md\`, \`0002-slug.md\`, ...). The directory is created lazily — only when the first ADR is written. New ADRs only when the decision is hard to reverse, surprising without context, AND the result of a real trade-off.

The actual direct children of the project root (truth, source of truth for the Contents list):
$children

Rules: (a) trailing slash on folder names; (b) backticks around names; (c) one-line description per bullet; (d) match the truth listing exactly — do not invent or omit entries; (e) the following are filtered as noise and must NOT appear in Contents: \`.git\`, \`.claude\`, \`node_modules\`, \`dist\`, \`build\`, \`out\`, \`.next\`, \`.nuxt\`, \`.venv\`, \`venv\`, \`__pycache__\`, \`target\`, \`vendor\`, \`.cache\`, \`.idea\`, \`.vscode\`, \`.fleet\`, \`.parcel-cache\`, \`coverage\`, \`.nyc_output\`, \`.turbo\`, \`.swc\`, \`*.tsbuildinfo\`, \`.eslintcache\`, \`.stylelintcache\`, \`.DS_Store\`, \`Thumbs.db\`, \`CLAUDE.md\` itself; (f) for sections with no content yet, leave them as HTML comments (\`<!-- ... -->\`) — the comment is invisible in rendered markdown but signals the slot exists; (g) \`## Language\` is NOT seeded here — it is added lazily by the grill skill when the first domain term is resolved.

After all sections above, append this line on its own:

> Long-running tasks: if \`work-in-progress.html\` exists at the project root, read it first — it is the live workplan kept in sync across sessions, compactions, and subagents."

jq -n --arg msg "$MSG" '{
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: $msg
  }
}'
