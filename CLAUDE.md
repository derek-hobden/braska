# Braska

Electron IDE that spawns Claude Code specialist agents in terminal tabs. Derek doesn't code — all changes are made by Claude Code agents. No bundler, no TypeScript, no framework — vanilla JS throughout.

## Architecture

Two-process Electron app: **main** (CommonJS) ↔ **preload** (contextBridge) ↔ **renderer** (ES modules).

- **Main (`main/`):** Each module exports `register({ ipcMain, BrowserWindow, dialog, shell, app })`. `main/index.js` calls all registers after `app.whenReady()`. 86 IPC handlers across 10 modules. Modules `require()` their own Node built-ins; only Electron objects are injected.
- **Renderer (`renderer/`):** `app.js` imports all modules, calls `init*()` functions to inject cross-module deps (avoids circular imports). Modules store injected deps in private `let` vars, used by event listeners.
- **Preload (`preload.js`, 189 lines):** Bridges main↔renderer via `contextBridge.exposeInMainWorld`. 15 namespaces: `versions`, `projects`, `skills`, `specialists`, `filetree`, `fileOps`, `fileEditor`, `todo`, `worktree`, `gitDiff`, `gitOps`, `github`, `pty`, `windowActions`, `dragDrop`.
- **State:** `main/state.js` uses getter/setter functions (CommonJS). `renderer/state.js` exports flat objects (`tabState`, `appState`, `modalState`, `explorerState`, `watchState`, `ghState`, `gitState`) — mutate via direct property assignment.
- **Shell commands:** Always `execFileAsync('cmd', ['arg1', 'arg2'], { cwd, encoding: 'utf-8', timeout })` from `main/utils.js`. Never `execSync`, never shell string interpolation.
- **IPC return shape:** `{ ok: true, ...data }` or `{ ok: false, error: errMsg(err) }`.
- **Dependencies:** electron, node-pty, @xterm/xterm, @xterm/addon-fit. That's it — don't add more.

## File map

```
main.js                     — 1-line redirect: require('./main/index')
preload.js              189 — IPC bridge (DO NOT MODIFY)
index.html              367 — Markup only, loads renderer/app.js as ES module
styles.css             2952 — All UI styles
splash.html                 — Startup splash screen

main/
  index.js              147 — App lifecycle, createWindow, register calls
  state.js               13 — Shared state (ptyProcesses Map, watcher refs)
  utils.js               25 — execFileAsync, pathExists, resolveInDir, errMsg, fsp
  projects.js            81 — loadProjects, saveProjects, getGitInfo (3 handlers)
  skills.js              37 — Skill CRUD (3 handlers)
  specialists.js         67 — Specialist CRUD, BUILTIN_SPECIALISTS array (3 handlers)
  specialists-setup.js   48 — Copy builtin specialists to ~/.braska on startup
  todo.js               127 — Todo CRUD + fs.watch (6 handlers)
  pty.js                 96 — PTY spawn/write/resize/kill (4 handlers)
  files.js              129 — File read/save, filetree CRUD/watch (12 handlers)
  git-read.js           142 — Status, diff, log, worktree-metrics (6 handlers)
  git-ops.js            273 — Stage/commit/push, branch, stash, amend/revert (21 handlers)
  git-worktree.js       333 — Pull-latest-main, worktree CRUD, merge ops (10 handlers)
  github.js             190 — All gh:* CLI wrappers (18 handlers)
  migration.js           40 — One-time data migration from legacy app names

renderer/
  app.js                266 — Entry point, init wiring, event delegation
  state.js               73 — All shared state objects (see Architecture above)
  utils.js              251 — escHtml, parseDiffOutput, icons, formatting
  dom-patch.js           81 — Keyed-list DOM reconciler for incremental updates
  sidebar.js            144 — Project list, worktree expand/collapse
  tabs.js               186 — Tab CRUD, switching, tab bar rendering
  terminals.js          325 — xterm setup, PTY bridge, browser/editor tabs
  notifications.js      198 — Notification log, busy/done indicators
  settings.js           288 — Settings view (specialists, skills)
  todo-panel.js         230 — Todo list, status changes
  file-explorer.js      342 — File tree rendering, panel switching, resize
  file-explorer-ops.js  399 — Rename, create, context menu, keyboard nav
  worktree-modals.js    434 — Worktree create/delete/merge modals
  git-changes.js        399 — Status panel, staging, commit toolbar (incremental DOM)
  git-changes-tree.js    90 — Tree view rendering for git changes panel
  git-changes-actions.js 222 — Changes body click delegation
  git-changes-modals.js 357 — Pull-main flow, branch modal, diff viewer
  github-panel.js       262 — GitHub auth, section routing, CI, notifications
  github-prs.js         249 — PR list, detail, create form
  github-issues.js      264 — Issue list, detail, create form

specialists/                — Builtin templates (copied to ~/.braska/specialists/ at startup)
  todoist/  debugger/  code-reviewer/  github-specialist/  merger/
```

## How to add features

**New IPC handler:**
1. Add `ipcMain.handle('namespace:action', async (_event, workDir, ...args) => { ... })` in the appropriate `main/*.js`
2. Add method to matching namespace in `preload.js`
3. Call `window.namespace.action(...)` from renderer

**New renderer feature:**
1. Export functions from new or existing `renderer/*.js` module
2. If it needs functions from other modules: add `init*(deps)` function, store deps in module-level `let` vars
3. Wire the init call in `renderer/app.js`
4. For unavoidable circular deps (rare): `const { fn } = await import('./module.js')`

**New specialist:**
1. Create `specialists/<name>/claude.md` (+ optional `.claude/settings.json`, `.claude/hooks/*.sh`)
2. Add name to `BUILTIN_SPECIALISTS` array in `main/specialists.js`
3. It auto-copies to `~/.braska/specialists/` on next app launch

## Rules

- **Don't modify `preload.js`** unless adding a new namespace (rare, discuss first)
- **Don't add npm dependencies** without explicit approval
- **Don't add TypeScript, a bundler, or a UI framework**
- **Don't use `execSync` or shell string interpolation** — always `execFileAsync` with argument arrays
- **Don't create files over 400 lines** — split into separate modules (existing oversize renderer files are legacy, not examples)
- **Don't break ES module imports** — one bad import path kills the entire renderer silently with no error
- **Don't use `innerHTML` with user content** without `escHtml()` from `renderer/utils.js`
- **Use `resolveInDir()`** from `main/utils.js` for any user-supplied relative paths (prevents directory traversal)
- **Comments explain WHY, not WHAT** — don't add obvious comments
- **Keep this file in sync** — if you add, remove, or rename a file in `main/` or `renderer/`, update the file map above

## Data directories

- `~/.braska/specialists/` — specialist configs (builtin + custom)
- `~/.braska/skills/` — skill markdown files
- `~/.braska/projects/<project-name>/todo/` — todo files (open/, done/, cancelled/)
- Electron userData (`~/Library/Application Support/Braska/`) — `projects.json`
