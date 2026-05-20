## Purpose
Main-process subsystem modules for Braska. Each module registers its IPC handlers via a `register({ ipcMain })` call invoked from `main/index.js`. State shared across handlers lives in `state.js`; per-repo persistent data lives under `<projectRoot>/.the-agency/`.

## Contents
- `index.js` — main-process entry point; imports all subsystem modules and calls their `register()` functions
- `state.js` — shared main-process state (open PTY sessions, project list, watcher handles, etc.)
- `utils.js` — shared utilities for the main process (`execFileAsync`, path helpers, etc.)
- `projects.js` — `projects:*` IPC handlers: list, add, remove, persist to `userData/projects.json`
- `git-read.js` — read-only git IPC handlers: `git:status`, `git:diff`, `git:log`, `git:branches`, etc.
- `git-ops.js` — mutating git IPC handlers: `git:stage`, `git:commit`, `git:pull`, `git:push`, etc.
- `git-worktree.js` — worktree IPC handlers: `git:worktree-add`, `git:worktree-remove`, `git:pull-latest-main`, etc.
- `git-fetcher.js` — background fetch loop that periodically runs `git fetch` for open worktrees
- `git-watcher.js` — `fs.watch` watcher that notifies the renderer when working-tree files change
- `github.js` — `gh:*` IPC handlers: shells out to the `gh` CLI for PRs, issues, CI runs, notifications, auth
- `pty.js` — `pty:*` IPC handlers: spawn/resize/kill PTY sessions via `node-pty`
- `files.js` — `files:*` IPC handlers: read, write, rename, delete files; directory listing
- `todo.js` — `todo:*` IPC handlers: read/write todo and ticket markdown files under `.the-agency/`
- `agents-setup.js` — `agents:*` IPC handlers: scaffold and manage expert directories under `~/.the-agency/experts/`
- `agents.js` — agent-related helpers used by `agents-setup.js`
- `skills.js` — `skills:*` IPC handlers: list and read skill markdown files under `~/.the-agency/skills/`
- `browser-view.js` — `browserView:*` IPC handlers: create/destroy/navigate Electron BrowserView instances
- `diagnostics.js` — `diagnostics:*` IPC handlers: system info, log tailing
- `migration.js` — one-time data migration logic run at startup
