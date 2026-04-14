# Braska

Electron IDE that spawns Claude Code agents in terminal tabs. Derek doesn't code — all changes are made by Claude Code agents. No bundler, no TypeScript, no framework — vanilla JS throughout.

## Architecture

Two-process Electron app: **main** (CommonJS) ↔ **preload** (contextBridge) ↔ **renderer** (ES modules).

- **Main (`main/`):** Each module exports `register({ ipcMain, BrowserWindow, dialog, shell, app })`. `main/index.js` calls all registers after `app.whenReady()`. Modules `require()` their own Node built-ins; only Electron objects are injected.
- **Renderer (`renderer/`):** `app.js` imports all modules, calls `init*()` functions to inject cross-module deps (avoids circular imports). Modules store injected deps in private `let` vars, used by event listeners.
- **Preload (`preload.js`):** Bridges main↔renderer via `contextBridge.exposeInMainWorld`. 16 namespaces: `versions`, `projects`, `skills`, `agents`, `filetree`, `fileOps`, `fileEditor`, `todo`, `worktree`, `gitDiff`, `gitOps`, `github`, `pty`, `browserView`, `windowActions`, `dragDrop`.
- **State:** `main/state.js` uses getter/setter functions (CommonJS). `renderer/state.js` exports flat objects (`tabState`, `appState`, `modalState`, `explorerState`, `watchState`, `ghState`, `gitState`) — mutate via direct property assignment.
- **Shell commands:** Always `execFileAsync('cmd', ['arg1', 'arg2'], { cwd, encoding: 'utf-8', timeout })` from `main/utils.js`. Never `execSync`, never shell string interpolation.
- **IPC return shape:** `{ ok: true, ...data }` or `{ ok: false, error: errMsg(err) }`.
- **Agents:** Uses Claude Code's native agent system. Agent definitions live in `~/.claude/agents/<name>.md` with YAML frontmatter. Braska copies builtin agents there on first run. Tabs spawn via `claude --agent <name>`.
- **Dependencies:** electron, node-pty, @xterm/xterm, @xterm/addon-fit. That's it — don't add more.

## File map

```
main.js                     — 1-line redirect: require('./main/index')
preload.js                  — IPC bridge (DO NOT MODIFY)
index.html                  — Markup only, loads renderer/app.js as ES module
styles.css                  — All UI styles
splash.html                 — Startup splash screen

main/
  index.js                  — App lifecycle, createWindow, register calls
  state.js                  — Shared state (ptyProcesses Map, watcher refs)
  utils.js                  — execFileAsync, pathExists, resolveInDir, errMsg, fsp
  projects.js               — loadProjects, saveProjects, getGitInfo (3 handlers)
  skills.js                 — Skill CRUD (3 handlers)
  agents.js                 — List agents from ~/.claude/agents/, BUILTIN_AGENTS array (1 handler)
  agents-setup.js           — Copy builtin agents to ~/.claude/agents/ and scripts to ~/.claude/scripts/ on startup
  todo.js                   — Todo CRUD + fs.watch (6 handlers)
  browser-view.js           — Browser tab WebContentsView management (replaces deprecated <webview>)
  pty.js                    — PTY spawn/write/resize/kill (4 handlers)
  files.js                  — File read/save, filetree CRUD/watch (12 handlers)
  git-read.js               — Status, diff, log, worktree-metrics (6 handlers)
  git-ops.js                — Stage/commit/push, branch, stash, amend/revert (21 handlers)
  git-worktree.js           — Pull-latest-main, worktree CRUD, merge ops (10 handlers)
  github.js                 — All gh:* CLI wrappers (18 handlers)
  migration.js              — One-time data migration from legacy app names

renderer/
  app.js                    — Entry point, init wiring, event delegation
  state.js                  — All shared state objects (see Architecture above)
  utils.js                  — escHtml, parseDiffOutput, icons, formatting
  dom-patch.js              — Keyed-list DOM reconciler for incremental updates
  sidebar.js                — Project list, worktree expand/collapse
  tabs.js                   — Tab CRUD, switching, tab bar rendering
  terminals.js              — xterm setup, PTY bridge, browser/editor tabs
  notifications.js          — Notification log, busy/done indicators
  settings.js               — Settings view (agents read-only, skills)
  todo-panel.js             — Todo list, status changes
  hover-link.js             — Bidirectional hover glow between worktree ↔ todo items
  file-explorer.js          — File tree rendering, panel switching, resize
  file-explorer-ops.js      — Rename, create, context menu, keyboard nav
  worktree-modals.js        — Worktree create/delete/merge modals
  git-changes.js            — Status panel, staging, sub-nav, GitHub view mode (incremental DOM)
  git-changes-graph.js      — Git graph computation, commit/stash element rendering
  git-changes-status.js     — Status toast for changes panel
  git-changes-tree.js       — Tree view rendering for git changes panel
  git-changes-actions.js    — Changes body click delegation
  git-changes-modals.js     — Pull-main flow, branch modal, diff viewer
  journey-cards.mjs         — Pure card computation for journey zone (testable, no DOM deps)
  journey-zone.js           — State-driven action cards (commit/share/merge-to-main/conflicts), branch header actions, overflow menu
  github-panel.js           — GitHub auth, section routing, CI, notifications (inline in unified panel)
  github-prs.js             — PR list, detail, create form
  github-issues.js          — Issue list, detail, create form

agents/                     — Builtin agent templates (copied to ~/.claude/agents/ on first run)
  todoist.md                — Todo creation agent with hook-based sandboxing
  code-reviewer.md          — Read-only code review agent
  debugger.md               — Systematic debugging agent
  github-specialist.md      — GitHub workflow agent (PRs, issues, CI)
  merger.md                 — Git merge conflict resolver
  committer.md              — Auto-commit agent (haiku) that batches changes into logical commits
  scripts/todoist/          — Hook scripts for todoist agent (copied to ~/.claude/scripts/todoist/)
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

**New agent:**
1. Create `~/.claude/agents/<name>.md` with YAML frontmatter (name, description, tools, model, etc.)
2. Or run `/agents` in any Claude Code tab to create one interactively
3. To ship as a Braska builtin: add the `.md` file to `agents/` in the repo and add the name to `BUILTIN_AGENTS` in `main/agents.js`

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

- `~/.claude/agents/` — agent definitions (builtin + custom, Claude Code native format)
- `~/.claude/scripts/` — hook scripts for agents (e.g. todoist sandboxing)
- `~/.braska/skills/` — skill markdown files
- `~/.braska/projects/<project-name>/todo/` — todo files (open/, done/, cancelled/)
- Electron userData (`~/Library/Application Support/Braska/`) — `projects.json`
