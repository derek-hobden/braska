#!/bin/bash
set -e

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
cat >/dev/null

WARNINGS=""

# JS / TS toolchain
if [ -f "$PROJECT_DIR/package.json" ]; then
  if [ ! -d "$PROJECT_DIR/node_modules" ]; then
    WARNINGS="${WARNINGS}
- node_modules/ is missing — run \`npm install\` (or \`pnpm install\` / \`yarn install\` / \`bun install\` per your lockfile). Until then, lint-staged / husky / pre-commit hooks will silently no-op."
  else
    pkg="$PROJECT_DIR/package.json"
    for tool in tsc prettier eslint stylelint vitest jest; do
      if grep -q "\"$tool\"" "$pkg" 2>/dev/null && [ ! -e "$PROJECT_DIR/node_modules/.bin/$tool" ]; then
        WARNINGS="${WARNINGS}
- \`$tool\` is declared in package.json but missing from node_modules/.bin/ — re-install or hooks that invoke it will silent-no-op."
      fi
    done
  fi
fi

# Python toolchain
if [ -f "$PROJECT_DIR/pyproject.toml" ] || [ -f "$PROJECT_DIR/requirements.txt" ] || [ -f "$PROJECT_DIR/setup.py" ]; then
  if [ ! -d "$PROJECT_DIR/.venv" ] && [ ! -d "$PROJECT_DIR/venv" ] && [ -z "$VIRTUAL_ENV" ]; then
    WARNINGS="${WARNINGS}
- No Python venv detected (.venv/ or venv/ or VIRTUAL_ENV) — declared tools (black/ruff/mypy/pytest) may not be available. Activate or create a venv."
  fi
fi

# Rust toolchain
if [ -f "$PROJECT_DIR/Cargo.toml" ] && ! command -v cargo >/dev/null 2>&1; then
  WARNINGS="${WARNINGS}
- \`cargo\` not in PATH — Rust toolchain missing. Install via rustup."
fi

# Go toolchain
if [ -f "$PROJECT_DIR/go.mod" ] && ! command -v go >/dev/null 2>&1; then
  WARNINGS="${WARNINGS}
- \`go\` not in PATH — Go toolchain missing."
fi

# git pre-commit hook installed but tools missing is the silent-failure case
if [ -d "$PROJECT_DIR/.git" ] && [ -f "$PROJECT_DIR/.husky/pre-commit" ] && [ ! -d "$PROJECT_DIR/node_modules" ]; then
  WARNINGS="${WARNINGS}
- .husky/pre-commit exists but node_modules/ does not — pre-commit will fail or silently skip."
fi

[ -z "$WARNINGS" ] && exit 0

jq -n --arg w "$WARNINGS" '{
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: ("⚠️  TOOLING PRE-FLIGHT WARNINGS:" + $w + "\n\nResolve these before relying on lint/format/type-check downstream — those tools may silently no-op until the toolchain is healthy. Tell the user explicitly if any of these block the requested work.")
  }
}'
