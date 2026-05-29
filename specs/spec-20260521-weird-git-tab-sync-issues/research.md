# Research Document: Git Tab Sync Issues in Braska (Issue #77)

## Problem summary

After pushing a worktree's branch to GitHub and creating a PR, the git changes tab still displays stale UI state—particularly the "X unpushed" subtitle and "Push" button remain visible even though the local branch is already synced with origin. Similarly, after merging a PR, the tab can show stale "changes to push" indicators. This occurs because the git status refresh mechanism (`refreshChanges()`) is not consistently triggered after git-affecting operations, leaving the UI out of sync with the actual git state.

## Approaches considered

**1. Add explicit `refreshChanges()` after every git-affecting operation in the renderer**
- Pros: Surgical, minimal scope, mirrors existing pattern (push flow)
- Cons: Brittle; requires audit of all git operations; easy to miss edge cases; no coverage for external GitHub operations (CLI, web UI)
- Precedent: Already done for push (git-changes.js:365), PR merge (github-prs.js:179–193)

**2. Extend fs.watch to remote-tracking refs (`.git/refs/remotes/`) for automatic detection**
- Pros: Architectural; covers all git operations including external ones
- Cons: High false-positive risk; CLAUDE.md documents a past infinite-refresh bug (2026-03-29) from fs.watch inside list handlers; `.git/` is noisy
- Precedent: Rejected in spec-20260519-git-tab-sync-after-merge research.md

**3. Add a generic post-fetch cache invalidation + debounced polling**
- Pros: Covers all remote-state changes eventually; no tight coupling to specific operations
- Cons: 5-minute worst-case latency (current gap); polling overhead; doesn't feel responsive for immediate actions
- Precedent: Partially implemented via git-fetcher.js

**4. Add IPC broadcast signal on git-state-affecting operations (`git:state-changed`)**
- Pros: Decoupled; covers all operations (local and remote); renderer can respond consistently
- Cons: Requires changes to main/git-ops.js, main/github.js, and preload.js; adds IPC overhead
- Precedent: Similar to `git:fetched` pattern already used

**5. Combine approaches 1 + 3: explicit refresh where we control the operation, plus 5-min fallback**
- Pros: Responsive for Braska-controlled ops; safety net for external changes
- Cons: Two mechanisms to maintain; still has 5-min gap for external operations
- Precedent: Closest to current architecture

## Recommended approach

**Implement Approach 4: Add a generic `git:state-changed` broadcast signal emitted after all git-affecting operations**

This decouples the refresh mechanism from individual operation handlers, automatically covering all git operations (local and remote) without tight coupling. The pattern mirrors the existing `git:fetched` broadcast already in use by git-fetcher.

**Phase 1 (immediate)**: Add explicit `refreshChanges()` calls after PR creation in `renderer/github-prs.js` following the existing post-push pattern in `git-changes.js:365`.

**Phase 2 (architectural)**: Implement the generic `git:state-changed` broadcast:
- Emit signal after successful operations in `main/git-ops.js` (push/pull/commit) and `main/github.js` (pr-create/pr-merge)
- Add `gitOps.onStateChanged()` listener export in `preload.js`
- Register debounced listener in `renderer/app.js` to call `refreshChanges()` + `refreshWorktreeMetrics()`

This prevents future regressions and handles external GitHub operations that Braska doesn't control directly.

## Verified tool behavior

**Claim 1: After `git push`, local branch HEAD matches origin/branch remote-tracking ref**
- Reproducer: `git update-ref refs/remotes/origin/feat HEAD` (simulates push)
- Verdict: **Claim holds.** `git rev-list --left-right --count origin/feat...HEAD` returns `0    0`

**Claim 2: Creating a PR doesn't change local git state**
- Reproducer: Same as Claim 1; PR creation is GitHub-side only
- Verdict: **Claim holds.** `git status --porcelain` shows no changes

**Claim 3: The git:status IPC handler correctly computes pushAhead via `git rev-list`**
- Reproducer: Code inspection of main/git-read.js:122–132
- Verdict: **Claim holds.** Uses standard `git rev-list --left-right --count` logic

**Claim 4: No refresh trigger fires after `gh:pr-create` in the renderer**
- Reproducer: Code inspection of renderer/github-prs.js:223–280
- Verdict: **Claim holds.** After PR creation, code calls `showGitHubPRList()` but NOT `_refreshChanges()`

**Claim 5: The git-fetcher's 5-minute interval is the only fallback for post-merge stale state**
- Reproducer: Code inspection of main/git-fetcher.js:14, 64–70
- Verdict: **Claim holds.** Fetch runs on startup (2s delay), window focus, then every 5 minutes

**Claim 6: PR merge handler calls `_refreshChanges()` after successful merge**
- Reproducer: Code inspection of renderer/github-prs.js:179–193
- Verdict: **Claim holds.** Fix from spec-20260519-git-tab-sync-after-merge is in place

**Implication for recommended approach**: All verified behaviors confirm that the refresh mechanism is incomplete for PR operations. Adding a generic `git:state-changed` broadcast will solve both the immediate gap (PR creation) and prevent future regressions (external merges, CLI operations).

## Unknowns

- Whether the github-specialist agent (the expert that does push + PR create) already calls refreshChanges via some untraced path after PR creation
- Whether there are other git operations beyond push, pull, commit, merge, pr-create, pr-merge that have similar gaps
- Whether the 5-minute fetch interval is acceptable to users for external merge detection
- Exact user-facing replication steps to reproduce the "weird git tab sync issues" from issue #77 (whether it's PR-create lag, merge lag, or some other operation)

## Files inventory

| File | Why relevant |
|------|-----------|
| `renderer/git-changes.js` | Core refresh logic: `refreshChanges()` (line 259), `onPushSuccess()` pattern (line 362–367) shows correct post-operation refresh pattern. |
| `renderer/github-prs.js` | PR creation form handler (showGitHubPRForm:223–280) missing `_refreshChanges()` call after success. Merge handler (lines 173–205) already calls it (pre-existing fix). |
| `renderer/app.js` | Git fetch listener (lines 232–238) shows the `git:fetched` → refreshChanges + refreshWorktreeMetrics pattern to replicate for generic state-changed signal. Initializes PRs module with `refreshChanges` dep (line 280). |
| `renderer/journey-zone.js` | Action handlers show inconsistent refresh patterns: `pull-push` (line 254–274) includes refreshes, but `push-pr` (line 285–286) starts expert without refresh. |
| `main/git-ops.js` | Push/pull handlers (lines 111–150) complete successfully but don't emit any broadcast signal; would be target for Phase 2 changes. |
| `main/github.js` | PR create handler `gh:pr-create` (lines 140–148) and merge handler `gh:pr-merge` (lines 150–197) would be targets for Phase 2 broadcast emission. |
| `main/git-fetcher.js` | Background fetch scheduler with 5-minute cadence (lines 14, 64–70) and `git:fetched` broadcast pattern (line 34) to be replicated. |
| `preload.js` | IPC bridge; would need `onStateChanged()` listener export for Phase 2. |
