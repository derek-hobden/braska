## Purpose
ESM renderer-process source for the Braska UI. All modules run in the Electron renderer (browser context) and communicate with the main process exclusively via the `window.*` IPC bridges exposed by `preload.js`. Modules are wired together through `init*()` dependency-injection calls in `app.js` to avoid circular imports.

## Contents
- `app.js` — renderer entrypoint; imports all modules and calls their `init*()` functions
- `state.js` — shared mutable state objects (`appState`, `tabState`, `ghState`, etc.) imported by reference across modules
- `sidebar.js` — left sidebar: project list, worktree items, badge refresh
- `tabs.js` — tab bar rendering and tab lifecycle management
- `terminals.js` — xterm terminal tabs, PTY spawn/resize, browser tabs, file editor tabs
- `file-explorer.js` — right panel tabs (file tree, GitHub, todo, git changes), `switchRightPanelTab`
- `file-explorer-ops.js` — file rename/delete/new-file/new-folder operations from the file tree
- `git-changes.js` — git changes panel: status, stage, commit, push, branch display
- `git-changes-actions.js` — action handlers (discard, checkout, open-diff, etc.)
- `git-changes-graph.js` — commit history graph rendering
- `git-changes-modals.js` — branch-create, push-and-create-PR modals
- `git-changes-status.js` — status bar messages in the changes panel
- `git-changes-tree.js` — tree-view mode for the changes file list
- `github-panel.js` — GitHub panel core: auth flow, subnav routing, CI section, notifications
- `github-prs.js` — PR list, PR detail view, PR create form
- `github-issues.js` — issue list and issue detail view
- `github-issues-create.js` — new-issue and edit-issue form
- `journey-zone.js` — journey cards (commit, push, PR pill, post-merge, etc.) rendered above the changes panel
- `journey-cards.mjs` — pure function `computeJourneyCards` (testable without DOM)
- `notifications.js` — GitHub notifications panel
- `todo-panel.js` — todo/ticket panel
- `settings.js` — settings view (skills, agents, MCP servers)
- `worktree-modals.js` — worktree create/delete/merge modals
- `clone-modal.js` — clone-repo modal
- `diagnostics-panel.js` — diagnostics view
- `hover-link.js` — file-path hover-to-open-in-editor link handler
- `markdown.js` — markdown rendering helper (wraps marked)
- `code-highlight.js` — syntax highlighting helper (wraps highlight.js)
- `dom-patch.js` — lightweight DOM diffing for incremental panel updates
- `utils.js` — shared utilities: `escHtml`, `timeAgo`, `SVG_*` icon constants, etc.
