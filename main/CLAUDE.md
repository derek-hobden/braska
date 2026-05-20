## Purpose
Electron main-process subsystem modules. Each file registers IPC handlers for one concern and is loaded by `main/index.js`. All git, GitHub, and filesystem operations happen here — never in the renderer.

## Contents
- `index.js` — main-process entrypoint; loads all subsystem modules and calls their `register()` functions
- `projects.js` — project list persistence, `getGitInfo` (worktrees + issue links), `ISSUE_BRANCH_RE`
- `git-read.js` — read-only git queries (status, diff, log, branch info)
- `git-ops.js` — mutating git operations (stage, unstage, commit, discard, checkout)
- `git-worktree.js` — worktree add/remove/link-issue IPC handlers
- `git-fetcher.js` — background git fetch loop
- `git-watcher.js` — `fs.watch`-based repo change detection; triggers sidebar/panel refreshes
- `github.js` — GitHub operations via `gh` CLI (issues, PRs, notifications, runs)
- `pty.js` — `node-pty` PTY lifecycle (spawn, resize, kill) for embedded terminals
- `files.js` — file-tree listing, file read/write for the editor panel
- `agents-setup.js` — expert/agent directory setup under `~/.the-agency/`
- `agents.js` — agent profile queries (list experts, get expert config)
- `skills.js` — skill markdown file management under `~/.the-agency/skills/`
- `todo.js` — ticket/todo file reads and writes under `<repo>/.the-agency/`
- `browser-view.js` — `BrowserView` lifecycle for embedded browser tabs
- `state.js` — main-process in-memory state shared across handlers
- `migration.js` — one-time data migrations for persistent state schema changes
- `diagnostics.js` — diagnostic info collection for the diagnostics panel
- `utils.js` — shared helpers: `execFileAsync`, `pathExists`, `fsp`, `errMsg`, `resolveGitDir`
