# Research — worktree from remote branch (#48)

## Problem summary

When the "Add Worktree" modal opens, the branch dropdown is populated by `git branch --format=%(refname:short)`, which lists only local branches. Remote-tracking branches (e.g. `origin/feature-xyz`) are never fetched and never appear. Users who want to check out a branch that only exists on the remote must first create a local tracking branch themselves before using the UI.

## Approaches considered

1. **Merge local and remote into a single dropdown** — Add a separator and list remote branches below local ones in the same `<select>`. Simple code path, but the list can grow large (dozens of remote branches) and there is no visual affordance distinguishing `main` (local) from `origin/main` (remote). Confusing when both exist.

2. **Local / Remote toggle within the existing form group** — Add two small pill buttons ("Local" / "Remote") beside the "Branch" label. Toggling swaps which `<select>` is visible: the existing `#wt-branch-select` for local, a new `#wt-remote-branch-select` for remote. Minimal HTML surface change; zero impact on the new-branch flow. Precedent: VS Code and GitHub Desktop both use a source toggle in their checkout flows.

3. **Unified branch list with `<optgroup>` separators** — Single `<select>` with `<optgroup label="Local">` and `<optgroup label="Remote">`. Cleaner than approach 1 but still hard to scan at 20+ remote branches, and value handling must strip the `origin/` prefix for path generation while keeping it for the git call.

4. **Text input accepting `origin/branch-name` directly** — Replace the select with a free-text field plus an auto-complete hint. Maximum flexibility; discoverable only by power users who know to type `origin/`.

## Recommended approach

**Approach 2 (Local / Remote toggle).** It isolates the change to the "use existing branch" sub-form, keeps both lists clean, and makes the user's intent explicit before any git command runs. The toggle state is purely UI — the branch value passed to `git:worktree-add` is unchanged (git handles `origin/branch-name` as a remote-tracking ref automatically, creating a local tracking branch with the short name).

## Unknowns

- Whether to run `git fetch --prune` on modal open to refresh the remote list. Fetching adds network latency; stale remote list is acceptable since the user can close and re-open. Decision: skip auto-fetch; document as a follow-up.
- Multi-remote repos (remotes other than `origin`). The `git branch -r` output would include all remotes. Safe to include all; path-generation strips everything up to and including the last `/` of the remote prefix only when it's a single component (e.g. `origin/`). For now strip `<remote>/` prefix by splitting on first `/`.

## Files inventory

| File | Why relevant |
|------|-------------|
| `main/git-worktree.js:140–150` | `git:branches` IPC handler — where `git:remote-branches` will be added |
| `main/git-worktree.js:152–175` | `git:worktree-add` handler — already supports remote refs; no change needed |
| `preload.js:59–73` | `window.worktree` bridge — needs `remoteBranches` added |
| `renderer/worktree-modals.js:78–103` | `openWorktreeCreateModal` — where remote branch load and toggle reset go |
| `renderer/worktree-modals.js:105–120` | `updateWorktreePath` — needs to strip remote prefix for path generation |
| `renderer/worktree-modals.js:259–320` | Event listeners and submit handler — toggle listeners and branch-value selection |
| `index.html:317–342` | Create modal HTML — where toggle buttons and second `<select>` are added |
| `styles.css:360–400` | Modal form-group styles — toggle button styles go here |
| `test/git-worktree.test.js` | Existing worktree tests — new `git:remote-branches` test goes here |
| `test/helpers.js` | Mock infrastructure — no changes needed |
