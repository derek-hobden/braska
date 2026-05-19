# Research — ability to create new GitHub repo directly from braska (#46)

## Problem summary

Users can start a local project in braska and run `git init` via the built-in "Initialize Repository" button in the Git Changes panel, but there is no way to then publish that repo to GitHub. Issue #46 asks for an in-app flow to run `gh repo create`, capturing the required inputs (name, owner/org, visibility, description) and wiring up the remote so the project immediately becomes a full GitHub repo.

## Approaches considered

### Approach 1 — Inline button in the "not a GitHub repo" state of the GitHub panel

After a user has a git repo but no GitHub remote, `renderer/github-panel.js` (lines 105–112) renders a "Not a GitHub repository" message. Add a "Create on GitHub…" button there that opens a small modal.

- **Pros:** Contextually obvious — user naturally navigates to GitHub panel to push; no UI surface changes outside the existing not-a-GH-repo screen.
- **Cons:** The user might never open the GitHub panel; it's slightly buried. Only visible when the project is a git repo but has no GitHub remote (which is the exact precondition, so this is fine).
- **Precedent:** The existing `changes-not-git-btn` in `git-changes.js` (lines 291–311) uses the same "render a call-to-action into the panel body" pattern.

### Approach 2 — New menu item in the sidebar "+" add-project popover

Add a third item `data-action="create-github"` to the `#add-project-menu` dropdown. The flow would pick a local folder, init git if needed, then show the GitHub create modal.

- **Pros:** Symmetric with "Clone from GitHub" — same dropdown, opposite direction. Discoverable.
- **Cons:** Conflates two separate concerns (picking a new folder vs. publishing an existing one). The user in issue #46 already has a local project open in braska, so a button on a project that is *already loaded* is more natural.

### Approach 3 — Context menu item on the main worktree row

Add a "Publish to GitHub…" item to the right-click `#wt-context-menu`, conditional on no existing GitHub remote.

- **Pros:** Fits the existing worktree context menu pattern.
- **Cons:** Right-click is undiscoverable; runtime detection for enable/disable adds complexity.

### Approach 4 — Journey zone card in the Git Changes panel

Add a new journey card that appears when `status.isGit && !status.isGitHub` — i.e., the repo is local git but has no GitHub remote.

- **Pros:** Journey zone is already the place for next-step suggestions; appears automatically in the right context.
- **Cons:** `isGitHub` is not currently propagated into the `status` object used by `journey-cards.mjs`; requires extra plumbing.

## Recommended approach

**Approach 1 (inline button in the GitHub panel) as the primary entry point.**

Rationale: The GitHub panel already has a dedicated "Not a GitHub repository" screen (`isGitHubRepo === false`) that shows exactly when the feature is relevant. Adding a "Create on GitHub…" button there is a minimal, targeted change to `renderer/github-panel.js`, requiring zero new UI scaffolding.

**End-to-end implementation sketch:**

1. **`main/github.js`** — add `ipcMain.handle('gh:repo-create', ...)` shelling out to:
   ```
   gh repo create <owner>/<name> --public|--private [--description <desc>] --source <workDir> --remote origin [--push]
   ```
   Handler accepts `{ workDir, name, owner, visibility, description, push }`.

2. **`main/github.js`** — add `ipcMain.handle('gh:auth-accounts', ...)` calling `gh api /user` and `gh api /user/orgs` to return `{ user, orgs }` for the owner dropdown.

3. **`preload.js`** — add `repoCreate` and `authAccounts` to `window.github`.

4. **`renderer/github-panel.js`** — in the `isGitHubRepo === false` branch, add "Create on GitHub…" button.

5. **`renderer/github-repo-create-modal.js`** (new file, following `clone-modal.js` pattern exactly) — modal with fields: Owner (dropdown), Repo name (text, pre-filled from folder name), Visibility (radio), Description (optional text), Push now (checkbox).

6. **`index.html`** — add `#create-repo-modal` div markup mirroring the clone modal.

7. **After success** — call `loadProjects()` + `refreshGitHub(workDir)` to flip the GitHub panel to its normal view.

## Unknowns

- **`gh repo create` flags for organization repos**: `gh repo create <owner>/<name>` vs `gh repo create <name> --owner <org>` — exact flag syntax needs verification against the installed `gh` version.
- **Multi-account `gh` auth**: `gh auth status` can list multiple GitHub hosts. The current parser grabs the first match. Affects the owner dropdown if user has multiple hosts.
- **Uncommitted work handling**: `gh repo create --source . --push` behavior when called on a repo with no commits — need a friendly "make an initial commit first" error.
- **Journey-zone card integration**: `isGitHub` is not currently propagated into the `status` object used by `journey-cards.mjs`; this would require small plumbing and is deferred to a follow-up.

## Files inventory

| File | Relevance |
|------|-----------|
| `main/github.js` | All `gh` CLI shells outs live here; new `gh:repo-create` and `gh:auth-accounts` handlers go here |
| `main/git-ops.js` | Contains `git:init` handler; shows the `{ ok: true }` mutation pattern |
| `renderer/git-changes.js` | Lines 285–311: the "Initialize Repository" button; existing post-init flow to integrate with |
| `renderer/github-panel.js` | Lines 105–112: the "Not a GitHub repository" message — primary insertion point |
| `renderer/clone-modal.js` | Modal implementation template to follow exactly |
| `renderer/state.js` | `modalState` object — new fields for create-repo modal state |
| `preload.js` | `window.github` bridge — `repoCreate` and `authAccounts` to be added |
| `index.html` | Lines 286–315: clone modal HTML — new `#create-repo-modal` div goes here |
| `renderer/journey-zone.js` | Secondary entry point if a journey card is added (deferred) |
| `renderer/journey-cards.mjs` | Card definitions for journey zone (deferred) |
