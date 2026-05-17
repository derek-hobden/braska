# Braska

## Purpose
Electron desktop app for running AI coding agents (Claude "experts") inside per-worktree terminal sessions, with embedded file explorer, git changes panel, GitHub integration, and ticket tracking. Each git worktree gets its own tab group; experts are folder-scoped Claude profiles assembled from skills.

## Contents
- `.gitignore` — ignore rules; includes `work-in-progress.html`, `node_modules/`, MetaClaude state.
- `agents/` — built-in expert/agent definitions and helper scripts bundled with the app.
- `bin/` — `cli.js` entrypoint published as the `braska` bin (lets users `npx braska`).
- `docs/` — design docs; ADRs land under `docs/adr/` (created lazily).
- `index.html` — main renderer HTML shell.
- `main.js` — Electron main-process entrypoint; delegates to `main/index.js`.
- `main/` — main-process subsystem modules (git, github, pty, projects, browser-view, state, ...).
- `package-lock.json` — npm lockfile.
- `package.json` — manifest; `main: main.js`, `bin: { braska: bin/cli.js }`.
- `preload.js` — context-bridge layer exposing IPC-backed `window.*` APIs to the renderer.
- `project.md` — running changelog of progress (dated entries describing each shipped feature).
- `renderer/` — ESM renderer code: sidebar, tabs, terminals, file explorer, git changes, github panel, todo panel.
- `splash.html` — frameless splash window that morphs into the main window on ready.
- `styles.css` — single global stylesheet for the renderer.
- `test/` — `node --test` suite.

## Stack
| Tool | Purpose |
|------|---------|
| Node.js | Main-process runtime |
| Electron 41.x | Desktop shell (main + renderer + preload) |
| `@electron/rebuild` | Native-module rebuild for the target Electron ABI |
| `node-pty` | Real PTYs for embedded terminals (rebuilt against Electron) |
| `@xterm/xterm` | Renderer-side terminal emulator |
| `@xterm/addon-fit` | Resize xterm to its container |
| `@xterm/addon-web-links` | Click-to-open URLs in terminal output |
| `gh` CLI (external) | All GitHub operations (issues, PRs, runs, notifications, auth) — shelled out from `main/github.js` |
| `git` CLI (external) | All worktree / branch / status / diff / commit operations |
| `claude` CLI (external) | Spawned via `node-pty` for expert sessions |
| npm | Package manager (lockfile present) |

## Architecture
The Electron main process (`main.js` → `main/index.js`) registers IPC handlers from every `main/*.js` module: `projects`, `git-*`, `github`, `pty`, `files`, `todo`, `agents-setup`, `skills`, `state`, `browser-view`, `migration`. Persistent app state lives in `app.getPath('userData')/projects.json`; per-repo state (todos, tickets, expert hooks, soon also worktree↔issue links) lives under `<projectRoot>/.the-agency/`.

The preload script (`preload.js`) is the only bridge: it exposes one `window.<namespace>` object per main subsystem (`projects`, `worktree`, `gitDiff`, `gitOps`, `github`, `pty`, `browserView`, `filetree`, `fileOps`, `fileEditor`, `todo`, `skills`, `agents`, `windowActions`). The renderer never imports Node APIs.

The renderer (`renderer/app.js` is the entrypoint) is ESM with explicit dependency-injection between modules via `init*()` calls — this avoids circular imports between `sidebar`, `tabs`, `app`, `terminals`, etc. UI is organised as: left sidebar (projects + worktrees), center main area (launchpad / terminal-view / settings / editor / diff tabs), right panel (file explorer / git changes / todo / github) with both side panels drag-resizable. Each worktree owns its own tab list (terminals, browsers, editors, diff views); switching worktrees in the sidebar swaps the active tab group while keeping background PTYs alive.

Experts are folders under `~/.the-agency/experts/<name>/` with a `claude.md` and `.claude/skills/<skill>/SKILL.md` symlinks; Claude is spawned with `cwd = workDir` and `--add-dir <expertDir>` so it picks up the expert config while the user's `@`-completion targets the repo. Skills are markdown files at `~/.the-agency/skills/<name>.md`. Tickets/todos are per-repo markdown files under `<repo>/.the-agency/{tickets,todos}/{open,done,cancelled}/`.

## Naming Conventions
- **Files:** `kebab-case.js` (renderer + main).
- **IPC channels:** `subsystem:action` (e.g. `git:worktree-add`, `gh:issue-list`, `pty:spawn`). Read operations use noun form (`git:status`); mutations use verb form (`git:stage`).
- **Preload bridges:** lowercase namespace on `window.` (e.g. `window.worktree`, `window.gitOps`, `window.github`).
- **Renderer module-private deps:** prefix with `_` (e.g. `_openWorkDir`, `_startTask`) when injected via `init*({...})`.
- **SVG icon constants:** `SVG_*` (PascalCase suffix) in `renderer/utils.js`.
- **CSS:** kebab-case classes; sidebar uses `.project-entry`, `.worktree-item`, `.wt-*`; right-panel tabs use `.filetree-tab` / `.gh-*` / `.todo-*` / `.changes-*` prefixes.

## Engineering Principles
- **YAGNI > DRY.** Two callers can copy 9 lines; three is the threshold for extraction. The Explore agents and `project.md` history show several "duplicate then merge" patterns that have aged well.
- **Read-with-try-catch over ensure-then-read.** `fs.watch` in the main process re-fires on any `mkdir`/`writeFile` — past bug (`project.md` 2026-03-29 entry): `ensureDir` inside a list handler caused an infinite refresh loop. Default to optimistic reads.
- **Shell out for git / gh / claude.** Don't reimplement what the CLIs already do. `execFileAsync` with explicit argv (never `exec(string)`) — avoids injection.
- **State at the boundary, not the middle.** Renderer modules receive their cross-cutting deps via `init*({...})` rather than reaching for globals; main process state belongs in `main/state.js` or per-handler closures.
- **No comments that explain WHAT.** Good identifiers do that. Keep comments for non-obvious WHY (subtle invariants, workarounds with citations).

## Architecture Decision Records
ADRs live in `docs/adr/`. Numbered sequentially (`0001-slug.md`, `0002-slug.md`, ...). The directory is created lazily — only when the first ADR is written. New ADRs only when the decision is hard to reverse, surprising without context, AND the result of a real trade-off.

> Long-running tasks: if `work-in-progress.html` exists at the project root, read it first — it is the live workplan kept in sync across sessions, compactions, and subagents.
