## Purpose
ESM renderer modules that run in Electron's renderer process. Each module owns a specific UI concern and receives cross-cutting dependencies via `init*()` calls to avoid circular imports. No Node.js APIs — only what's exposed through `preload.js`.

## Contents
- `app.js` — entrypoint; bootstraps all modules and wires `init*()` dependencies
- `state.js` — shared renderer state (active worktree, tab state)
- `sidebar.js` — project list, worktree rows, expand/collapse, worktree icon logic
- `tabs.js` — per-worktree tab groups (terminals, browsers, editors, diff views)
- `terminals.js` — xterm.js terminal instances, PTY lifecycle, expert spawning
- `settings.js` — settings panel UI
- `file-explorer.js` — right-panel file tree rendering and navigation
- `file-explorer-ops.js` — file operations (rename, delete, new file/folder) triggered from the tree
- `git-changes.js` — git changes right-panel: orchestration and entry point
- `git-changes-status.js` — staged/unstaged file list rendering
- `git-changes-tree.js` — tree view for changed files
- `git-changes-graph.js` — commit graph rendering in the changes panel
- `git-changes-actions.js` — stage, unstage, commit, discard actions
- `git-changes-modals.js` — modal dialogs for commit and discard confirmation
- `github-panel.js` — GitHub right-panel tab container (issues, PRs, notifications)
- `github-issues.js` — GitHub issues list and detail view
- `github-issues-create.js` — new-issue creation form
- `github-prs.js` — pull requests list and detail view
- `todo-panel.js` — todos/tickets right-panel
- `diagnostics-panel.js` — diagnostics/debug panel
- `journey-zone.js` — "journey zone" contextual action cards above the terminal
- `journey-cards.mjs` — pure functions computing which journey cards to show (testable)
- `notifications.js` — notification badge updates in the sidebar
- `worktree-modals.js` — modals for creating/deleting worktrees
- `clone-modal.js` — modal for cloning a remote repository
- `markdown.js` — markdown rendering helpers
- `code-highlight.js` — syntax highlighting wrapper
- `hover-link.js` — hover-to-preview link handler
- `dom-patch.js` — minimal DOM diffing utility for partial re-renders
- `utils.js` — shared SVG icon constants (`SVG_*`) and small DOM helpers
