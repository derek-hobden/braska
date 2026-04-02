# Braska Performance & Architecture Audit

## Progress

- [x] **Phase 1:** Split index.html (7,490 lines) into 13 ES modules in `renderer/` + `styles.css` + markup-only `index.html` (367 lines).
- [x] **Phase 2:** Split main.js (1,989 lines) into 15 CommonJS modules in `main/` (largest: 390 lines). Converted all 55 `execSync` calls to `execFileAsync`. 86 IPC handlers verified.
- [x] **Phase 3:** Extract `ensureSystemSpecialists()` (390 lines in `main/specialists-setup.js`) into actual template files in `specialists/`.
- [x] **Phase 4:** Write CLAUDE.md documenting the final architecture.

### Lessons from Phase 1
- **Import pattern:** `import { tabState } from './state.js'` → access via `tabState.activeTabId`. Mutate via `tabState.activeTabId = id`.
- **Cross-module deps:** Use init functions (`initSidebar({ openWorkDir, ... })`) to avoid circular imports. Functions are only called after all modules load.
- **Key pitfall:** One broken import (e.g., `import { state }` when `state` isn't exported) silently kills the ENTIRE ES module tree. Use the Python import/export validation script to catch these (see git history).
- **CSP:** Keep `'unsafe-inline'` in `script-src` for now. Removing it doesn't break modules but was in the original.
- **DOM element IDs:** When extracting inline JS to modules, verify all `getElementById` calls match the actual HTML IDs. Wrong IDs return `null` and crash silently (especially in `async` functions where the rejection is swallowed). Bugs found post-extraction: `main-panel` → `main`, `settings-view` → `settings-panel` (in tab-switching code).
- **Relative import paths:** Renderer ES modules live in `renderer/`, so `./node_modules/` resolves to `renderer/node_modules/` (doesn't exist). Use `../node_modules/` for project-root dependencies (xterm, addon-fit).

### Lessons from Phase 2
- **Module pattern:** Each module exports `register({ ipcMain, BrowserWindow, dialog, shell, app })` to wire its own IPC handlers. Modules `require()` their own Node built-ins; only Electron objects are injected.
- **Shared state:** `main/state.js` exports `ptyProcesses` Map + getter/setter functions for `nextPtyId`, `activeWatcher`, `activeTodosWatcher`.
- **Cross-module deps:** `getGitInfo` exported from `projects.js` (used by git-read, git-ops, git-worktree). `getTodosDir` exported from `todos.js` (used by pty, github). `getSpecialistsDir` exported from `specialists.js` (used by pty, specialists-setup).
- **execSync elimination:** `execFileAsync` with argument arrays replaces all shell string interpolation. The `safe()` escaping helper is gone. `2>&1` suffixes removed (stderr available separately via `err.stderr`).
- **Entry point:** Root `main.js` is `require('./main/index')`. `package.json` `"main"` stays `"main.js"`.
- **Specialist split:** `specialists.js` (67 lines, IPC handlers) + `specialists-setup.js` (41 lines, copy-if-newer). Template content lives in `specialists/` directory.

---

## Current architecture

### File structure (post Phase 1+2+3)

```
main.js                     — Entry redirect: require('./main/index') (1 line)
preload.js                  — IPC bridge, contextBridge (189 lines, don't touch)
index.html                  — Markup only + <script type="module"> (367 lines)
styles.css                  — All UI styles (extracted from index.html)
splash.html                 — Loading screen

renderer/                   — Frontend (ES modules, import/export)
  app.js                    — Entry point, init wiring
  state.js                  — Shared mutable state (tabState, appState, etc.)
  sidebar.js                — Project list, worktree expand/collapse
  tabs.js                   — Tab CRUD, switching, tab bar
  terminals.js              — xterm setup, PTY bridge, resize
  file-explorer.js          — File tree, drag-drop, rename, context menus
  git-changes.js            — Status panel, staging, commit, diff
  github-panel.js           — PRs, issues, CI status
  todos-panel.js            — Todo list, status changes
  tickets-panel.js          — Ticket management
  notifications.js          — Notification log, busy indicators
  settings.js               — Settings view
  worktree-modals.js        — Worktree create/delete/merge modals
  utils.js                  — Pure utilities (icons, formatting, escaping)

specialists/                — Builtin specialist templates (copied to ~/.braska/specialists/ at startup)
  todoist/                  — claude.md + .claude/{settings.json, hooks/*.sh}
  debugger/                 — claude.md
  code-reviewer/            — claude.md + .claude/settings.json
  github-specialist/        — claude.md
  merger/                   — claude.md

main/                       — Backend (CommonJS, require/module.exports)
  index.js          (137)   — App lifecycle, createWindow, register calls
  state.js           (13)   — Shared mutable state (ptyProcesses, watchers)
  utils.js           (25)   — pathExists, resolveInDir, errMsg, execFileAsync
  migration.js       (40)   — migrateData() from legacy app names
  projects.js        (81)   — loadProjects, saveProjects, getGitInfo + 3 handlers
  skills.js          (37)   — getSkillsDir, listSkills + 3 handlers
  specialists.js     (67)   — getSpecialistsDir, listSpecialists + 3 handlers
  specialists-setup.js  (41) — copyIfNewer, ensureBuiltinSpecialists (reads from specialists/)
  todos.js          (124)   — getTodosDir, listTodos, ensureTodosDirs + 6 handlers
  pty.js             (96)   — PTY spawn/write/resize/kill + 4 handlers
  files.js          (129)   — file read/save, filetree CRUD/watch + 12 handlers
  git-read.js       (142)   — status, worktree-metrics, diff, log, commit-files, diff-commit (6 handlers)
  git-ops.js        (273)   — stage/commit/push + branch + stash + discard/amend/revert (21 handlers)
  git-worktree.js   (333)   — pull-latest-main, worktree CRUD, merge ops (10 handlers)
  github.js         (190)   — All gh:* handlers (18 handlers)
```

### Dependency graph (main/, acyclic)

```
state.js, utils.js          ← no deps (leaf nodes)
migration.js                ← utils.js
projects.js                 ← utils.js
skills.js                   ← utils.js
specialists.js              ← utils.js, skills.js
specialists-setup.js        ← utils.js, specialists.js
todos.js                    ← utils.js, state.js
pty.js                      ← state.js, todos.js, specialists.js
files.js                    ← utils.js, state.js
git-read.js                 ← utils.js, projects.js
git-ops.js                  ← utils.js, projects.js
git-worktree.js             ← utils.js, projects.js
github.js                   ← utils.js, todos.js
index.js                    ← all of the above
```

### IPC handler distribution (86 total)

| Module | handle | on | Total |
|--------|--------|----|-------|
| git-ops.js | 21 | 0 | 21 |
| github.js | 18 | 0 | 18 |
| files.js | 10 | 2 | 12 |
| git-worktree.js | 10 | 0 | 10 |
| git-read.js | 6 | 0 | 6 |
| todos.js | 4 | 2 | 6 |
| pty.js | 2 | 2 | 4 |
| projects.js | 3 | 0 | 3 |
| skills.js | 3 | 0 | 3 |
| specialists.js | 3 | 0 | 3 |

---

## What's good (don't touch)

- **preload.js** (189 lines) — Clean namespaces, proper contextBridge. Perfect size.
- **PTY lifecycle** — Correct spawn/kill/cleanup in `main/pty.js`
- **File watchers** — Single watcher, properly closed before replacement in `main/files.js` + `main/todos.js`
- **resolveInDir()** — Correct path traversal guard in `main/utils.js`, consistently used
- **Notification system** — Capped at 50, debounced, correct in `renderer/notifications.js`
- **5 dependencies** — Don't add more without strong reason

---

### Lessons from Phase 3
- **Template layout:** Each specialist is a directory mirroring the runtime structure: `claude.md` for instructions, optional `.claude/settings.json` for hooks, optional `.claude/hooks/*.sh` for scripts.
- **Hook paths:** `settings.json` hook commands use `$HOME` instead of absolute paths — the shell expands it at runtime, making templates portable across machines.
- **Copy-if-newer:** `specialists-setup.js` compares mtime before copying. User edits to builtin specialists survive restarts; only overwritten when the app ships updated templates.
- **Single entry point:** `ensureBuiltinSpecialists()` replaces the previous `ensureSystemSpecialists()` + `ensureMergerSpecialist()` — all 5 specialists are peers in the `specialists/` template directory.

---

## Remaining work

### Phase 4: Add CLAUDE.md

**Why:** Every conversation starts cold. A project guide eliminates the re-discovery phase.

**Contents after the refactoring is complete:**
- Architecture overview (main → preload → renderer, module map)
- IPC contract summary (handler distribution, return shape convention)
- State management (renderer: `state.js` with ES module exports; main: `state.js` with getter/setters)
- Common patterns (how to add a handler, how to add a renderer feature)
- "Don't touch" list (preload.js, resolveInDir, PTY lifecycle)
- Specialist system overview
- Comments convention (WHY not WHAT)

**Write this LAST** so it documents the actual post-refactor structure.

---

## AI-specific conventions

### Comments: WHY not WHAT

The useful comments explain non-obvious decisions:

```js
// For Claude/specialist spawns, explicitly cd to workDir before running the command.
// Login shells (-l) read profile files that may change the working directory,
// so we cannot rely on cwd alone to guarantee the correct working directory.
```

**Where comments matter most:**
- Non-obvious IPC handler behavior (e.g., why `git:pull-latest-main` stashes before merge)
- Why `--dangerously-skip-permissions` is used (intentional, not accidental)
- Why migration functions exist and when they can be removed
- Edge cases in git flow (detached HEAD handling, bare repos, etc.)

### File size discipline

**Hard limit: 400 lines per file.** This ensures any file can be fully read in one call, Edit tool has high match specificity, and Grep hits are file-level meaningful.

### Consistent IPC return shapes

All handlers should return `{ ok: boolean, error?: string, ...data }`.

### Module patterns

- **Renderer (ES modules):** `export function`, init functions for dependency injection, shared state in `renderer/state.js`
- **Main (CommonJS):** `module.exports = { register }`, modules `require()` own Node built-ins, Electron objects injected via `register(deps)`

---

## Do NOT do

| Temptation | Why not |
|---|---|
| Add bundler | ES modules work natively in Electron. Zero benefit. |
| Add TypeScript | Use `// @ts-check` + JSDoc incrementally. |
| Add framework | UI complexity doesn't warrant it. Modules + vanilla JS is fine. |
| Add tests before splitting | Can't test 162 global functions. Extract utils.js first, test that. |
| Virtual scrolling | Lists are small enough. Not a real problem. |

---

## Verification checklist

- [x] Phase 1: App loads identically. Each renderer file is <400 lines. `import` graph is acyclic.
- [x] Phase 2: All 86 IPC handlers present. Each main module is <400 lines. Zero `execSync` remaining. `safe()` helper eliminated.
- [x] Phase 3: Specialists appear in picker. Launching each specialist works with correct instructions and hooks.
- [x] Phase 4: A fresh Claude Code conversation can orient itself by reading CLAUDE.md and understand the full architecture.
