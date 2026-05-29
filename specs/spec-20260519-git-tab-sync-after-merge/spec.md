# Spec — after pushing to git, opening pr, and merging. the git tab still shows changes to be pushed (#26)

Issue: [#26](https://github.com/derek-hobden/braska/issues/26) · PR: [#50](https://github.com/derek-hobden/braska/pull/50) · branch: `claude/issue-26` · started: 2026-05-19T00:00:00Z

**Status:** Complete; ready for review.

## Issue body

> after pushing to git, opening pr, and merging. the git tab still shows changes to be pushed
>
> this leads me to believe we have sync issues between the UI and the actual true git status all over the application

## Chosen approach

The merge button handler in `renderer/github-prs.js` calls `window.github.prMerge()` and on success only re-renders the PR detail view or switches worktrees — it never calls `refreshChanges()`. This leaves the branch subtitle ("X unpushed") and the changes section stale. The fix is to inject `refreshChanges` into `initGitHubPRs` (mirroring how the post-push flow already works) and call it with the appropriate `workDir` in all three success branches of the merge handler. This is a three-line addition to the renderer following an existing pattern (`onPushSuccess` in `git-changes.js` calls `refreshChanges(workDir)` after every push).

## Assumptions

- ✓ **confident** — `refreshChanges(workDir)` is safe to call speculatively after any git operation: it's idempotent, already debounce-guarded by a generation counter (`_refreshGen`), and the existing push flow calls it the same way.
- ✓ **confident** — The `worktreeCleanedUp && cleanDir === workDir` branch in the merge handler switches to main via `_openWorkDir(r.mainWorktreePath)`, but `openWorkDir` only calls `refreshChanges` when the active right-panel is already 'changes'. Since the user is on the GitHub panel when merging, the branch subtitle stays stale. Calling `refreshChanges(r.mainWorktreePath)` after `_openWorkDir` ensures it is updated.
- ✓ **confident** — `refreshChanges` is already exported from `git-changes.js` and imported in `app.js`; adding it to the `initGitHubPRs` injection is a one-line change.

## Definition of done

- After merging a PR (any of the three merge handler branches), the branch subtitle in the git changes panel no longer shows a stale "X unpushed" count.
- `npm test` exits 0.
- `renderer/github-prs.js` contains a call to `refreshChanges` in the merge success handler.
- `renderer/app.js` passes `refreshChanges` into `initGitHubPRs`.

## Up-front tests

No new test file. The change is a three-line addition to a DOM/IPC-coupled event handler. The existing test suite (`node:test`) covers pure functions; writing a meaningful test for this handler would require mocking Electron's `window.github`, the DOM, and `refreshChanges` — which is not the project's test style and would be performative. Correctness is verified by inspecting the grep output in the Verify block (see TDD carve-out entry in Decisions).

## Tasks

- [x] Inject `refreshChanges` into `initGitHubPRs` and call it after all merge success paths in `renderer/github-prs.js`
  - _Story: As a user, when I merge a PR via the braska GitHub panel, the branch subtitle and changes section immediately reflect the true git state._
- [x] Update `renderer/app.js` to pass `refreshChanges` into the `initGitHubPRs()` call

## Verify

```bash
node --test test/git-pull.test.js test/git-worktree.test.js test/journey-cards.test.mjs
grep -n "refreshChanges" renderer/github-prs.js
grep -n "refreshChanges" renderer/app.js | grep "initGitHubPRs"
```

## Decisions

_Appended chronologically as implementation reveals choices._

**TDD carve-out (2026-05-19):** Test-first skipped for the merge handler change. The handler is tightly coupled to `window.github` (IPC), the DOM, and callback injections. A test would be a mock-heavy integration stub that doesn't reflect the project's `node:test` style (pure function tests). Bar is "test would be performative" — that bar is met here.

## Don'ts (rejected approaches)

**Extending git-watcher:** Watching `.git/refs/remotes/` for remote-ref deletions was considered. Rejected due to the past infinite-refresh bug documented in CLAUDE.md (2026-03-29). High false-positive risk from the noisy `.git/` subtree.

**5-minute fetch polling:** `git-fetcher` already calls `refreshChanges` via the `git:fetched` listener. Relying on this for post-merge sync would leave a worst-case 5-minute stale window. Not appropriate as the sole fix.

## Course corrections

_None yet._

## Subagent notes

Research subagent confirmed:
- Primary gap: `renderer/github-prs.js` merge handler (lines 169–191) never calls `refreshChanges()`.
- Pattern to follow: `onPushSuccess()` in `renderer/git-changes.js` (line 362–367).
- `openWorkDir()` in `app.js` calls `refreshRightPanel()` which only dispatches to `refreshChanges` if the active panel is already 'changes'. Since the user is on GitHub panel when merging, this doesn't cover the case.
- `gitState.mergedToMain` in `renderer/state.js` appears to be dead code — not wired to any refresh logic.

## Follow-ups (deferred work)

_None yet._

## Open questions

_None._

## Baseline verify (pre-implementation)

_Populated at end of Phase 2._

## Verification results (post-implementation)

_Populated in Phase 4._
