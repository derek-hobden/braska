# Research — git UI sync after push/merge (#26)

## Problem summary

After a PR is merged via GitHub, the changes panel continues to display "changes to push" rather than reflecting that the branch is up-to-date. The root cause is that the merge success handler in `renderer/github-prs.js` re-renders the PR detail view but does not call `refreshChanges()` for the active worktree. The `git-watcher` only fires on `.git/HEAD` changes and worktree structure changes, so remote-ref deletions and upstream merges that don't alter the local HEAD never trigger an automatic status recompute.

## Approaches considered

**1. Add explicit `refreshChanges()` after PR merge in renderer**
- After `window.github.prMerge()` succeeds, call `refreshChanges(workDir)` in `github-prs.js`.
- Pros: Surgical, minimal change; mirrors the existing pattern in `doPush()`.
- Cons: Only fixes the merge-via-braska path; doesn't catch external merges or other git operations.

**2. Extend git-watcher to emit on remote-tracking ref updates**
- Watch `.git/refs/remotes/` for changes to catch remote ref deletions and upstream merges.
- Pros: Architectural; catches all remote-state changes.
- Cons: High noise risk; CLAUDE.md notes a past infinite-refresh bug (2026-03-29) from fs.watch inside list handlers. High implementation risk.

**3. Use existing `git:fetched` broadcast to always trigger a status refresh**
- `git-fetcher` already broadcasts `git:fetched`; extend `app.js` listener to call `refreshChanges()` for the active worktree unconditionally.
- Pros: Covers post-merge state within 5 minutes; no new IPC needed.
- Cons: 5-minute worst-case latency; unhelpful for immediate post-merge feedback.

**4. Track merge metadata and refresh on GitHub panel exit**
- Store merge result, then trigger `refreshChanges()` when user navigates away.
- Pros: Non-blocking.
- Cons: Subtle timing; misses users who keep the panel open; doesn't solve other gaps.

## Recommended approach

**Approach 1 as the primary fix**, plus a targeted audit of other git operations that already have a clear gap.

The `doPush()` function in `renderer/git-changes.js` already calls `refreshChanges(workDir)` after a push — the merge handler simply needs the same treatment. The existing `git:fetched` listener in `app.js` (lines 230–237) also calls `refreshChanges()` after fetch, so the background-polling path is already partially wired. The immediate gap is the PR merge success handler.

Secondary: also check `gh:pr-merge` in `main/github.js` — it deletes the local branch on merge but does not emit any signal to trigger a renderer refresh.

## Unknowns

- Whether other git operations (rebase, worktree merge, branch delete via sidebar) have the same pattern gap — need to audit each handler.
- Whether `gitState.mergedToMain` in `renderer/state.js` (line 87) was intended for tracking this but was never wired up.
- Whether `git:fetched` reliably reaches the renderer when the app is backgrounded (may depend on window visibility/focus state).

## Files inventory

| File | Relevance |
|------|-----------|
| `renderer/github-prs.js` | PR detail view; merge button handler (line ~162–191) is the primary gap — no `refreshChanges()` call after merge. |
| `renderer/git-changes.js` | Implements `refreshChanges()`; `doPush()` shows the correct post-op refresh pattern. |
| `renderer/app.js` | Registers `git:fetched` listener (lines 230–237) that calls `refreshChanges()` — shows the mechanism works when triggered. |
| `main/github.js` | `gh:pr-merge` IPC handler; deletes local branch after merge but doesn't broadcast a git-state change to the renderer. |
| `main/git-watcher.js` | Watches `.git/HEAD` and worktree structure; doesn't cover remote ref changes or upstream merges. |
| `main/git-read.js` | Computes `pushAhead` for the changes panel; correct logic, just not triggered after merge. |
| `renderer/state.js` | Contains `gitState.mergedToMain` — possibly intended for this pattern, never wired. |
| `renderer/git-changes-modals.js` | Post-pull-latest refresh pattern: calls `_refreshChanges()` + `_refreshWorktreeMetrics()` — the template for what merge completion should do. |
| `renderer/journey-zone.js` | Calls `refreshChanges()` on PR pill click; not on merge completion. |
