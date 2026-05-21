# Spec — Sidebar worktree badge shows stale modified-files count after commit until manual refresh (#76)

Issue: [#76](https://github.com/derek-hobden/braska/issues/76) · PR: [#79](https://github.com/derek-hobden/braska/pull/79) · branch: `claude/issue-76` · started: 2026-05-21T00:00:00Z

**Status:** Implementation complete; verifying.

## Issue body

> ## Repro
> 1. On a worktree with many modified files (e.g. 14), commit them all so the working tree is clean (no staged or unstaged changes).
> 2. Look at the worktree entry in the left sidebar.
>
> ## Actual
> The pill next to the worktree name still shows `14M`, as if 14 files were still modified.
>
> ## Expected
> The badge should clear (or update to the new count) as soon as the commit completes, matching the now-clean working tree.
>
> ## Notes
> - A manual refresh updates the UI correctly, so the underlying status read is fine — the auto-refresh trigger after a commit is what's missing/stale.
> - Likely related to the sidebar worktree status pill not being invalidated on commit events from the git changes panel / terminal-driven commits.

## Chosen approach

Two one-line additions, one in each of the two paths that miss the badge refresh:

**Fix A** — In `renderer/app.js`, add `refreshWorktreeMetrics()` to the `isGitChange` branch of the `filetree.onChange` handler (before the early `return`). Every commit writes to `.git/refs/heads/…`, which fires the fs.watch, which hits this branch. The badge is currently not updated here; `refreshChanges` is called instead. Adding `refreshWorktreeMetrics()` as a sibling call closes the bug for every commit source that touches the active worktree: manual modal, agent PTY, raw terminal.

**Fix B** — In `renderer/terminals.js`, expose `refreshWorktreeMetrics` as an injected dependency via `initTerminals` (alongside the existing `refreshRightPanel`), then call it unconditionally in the `pty.onExit` handler. The existing `refreshRightPanel` call is gated on `workDir === tabState.activeWorkDir`, so background-worktree commits are never covered. `refreshWorktreeMetrics` runs across all worktrees anyway, so no guard is needed.

Both changes are consistent with the established pattern in `git-changes-modals.js` where every successful commit calls both `_refreshChanges` and `_refreshWorktreeMetrics`.

## Assumptions

- ✓ **confident** — `filetree.onChange` fires during a commit because `git commit` writes to `.git/refs/heads/…`, whose filename is matched by `filename.startsWith('.git/')`.
  - _Basis (reproducer)_: see research.md → Verified tool behavior → "Claim 1". fs.watch emitted 14 events with `.git/`-prefixed filenames during a `git commit` run.

- ✓ **confident** — The `isGitChange` branch in `app.js` does not call `refreshWorktreeMetrics()`.
  - _Basis (file:line)_: `renderer/app.js:205-211` — the branch calls `refreshChanges(tabState.activeWorkDir)` then `return`; no `refreshWorktreeMetrics` call is present.

- ✓ **confident** — The `pty.onExit` handler in `terminals.js` does not call `refreshWorktreeMetrics()`, and the existing `refreshRightPanel` call is guarded by `workDir === tabState.activeWorkDir`.
  - _Basis (file:line)_: `renderer/terminals.js:128-135` — only `refreshRightPanel(workDir)` is called, gated on the active worktree check.

- ✓ **confident** — `refreshWorktreeMetrics` is exported from `renderer/sidebar.js` and is already imported in `renderer/app.js`.
  - _Basis (file:line)_: `renderer/app.js:5` — `import { ..., refreshWorktreeMetrics, ... } from './sidebar.js'`.

- ✓ **confident** — `initTerminals` in `terminals.js` receives its cross-module deps as a plain object; adding a new key is non-breaking.
  - _Basis (file:line)_: `renderer/terminals.js:497-499` — `export function initTerminals({ refreshRightPanel: _refreshRightPanel }) { refreshRightPanel = _refreshRightPanel; }`.

- ✓ **confident** — A duplicate call to `refreshWorktreeMetrics()` (once from the fs.watch event, once from PTY onExit) is harmless; the function is idempotent.
  - _Basis (file:line)_: `renderer/git-changes-modals.js:95,102,119` — the commit modal already calls `_refreshWorktreeMetrics()` multiple times in its success path without guard.

## Definition of done

- After committing all changed files in a worktree, the sidebar badge for that worktree clears within ~1 s without any manual refresh.
- After an agent PTY (e.g. `committer`) exits on a background worktree (not the one currently viewed), its sidebar badge clears when next seen.
- Running `node --test test/*.test.js test/*.test.mjs` exits 0 with all tests passing.

## Up-front tests

The renderer has no test infrastructure (all tests in `test/` target the main process via Node.js `require`). The changes are two wiring lines in renderer event handlers; writing a meaningful unit test would require setting up a full DOM mock environment that doesn't exist in this project. The TDD carve-out applies: tests would be performative given the missing infrastructure.

No new test files are added.

## Tasks

Statuses: `- [ ]` pending, `- [x]` done, `- [ ] ~~text~~ — deferred: <reason>` deferred.

- [x] Fix A: add `refreshWorktreeMetrics()` to the `isGitChange` branch in `renderer/app.js`
  - _Story: As a developer, when I commit all staged changes so the working tree is clean, then the sidebar worktree badge clears within ~1 s without manual refresh._
  - _test: no test (renderer; see Up-front tests rationale)_
- [x] Fix B: pass and call `refreshWorktreeMetrics` in `renderer/terminals.js` PTY `onExit` handler
  - _Story: As a developer, when a committer agent on a background worktree exits, the badge for that worktree shows the updated count when I next look at it._
  - _test: no test (renderer; see Up-front tests rationale)_

## Verify

```bash
node --test test/*.test.js test/*.test.mjs
```

## Decisions

2026-05-21: TDD carve-out applied for both fixes. All tests in `test/` target the main process via `node:test` + CJS `require`; the renderer is DOM/ESM with no test infrastructure. Writing meaningful unit tests for these two wiring lines would require setting up a full DOM mock environment that doesn't exist in this project. The TDD carve-out threshold ("test would be performative") is met. Both changes add `refreshWorktreeMetrics()` as a sibling call alongside already-tested call sites.

## Don'ts (rejected approaches and disproved assumptions)

_Nothing disproved yet._

## Course corrections

_None._

## Subagent notes

Research subagent confirmed via live reproducers:
- `fs.watch` fires `.git/`-prefixed filenames on commit (14 events observed in `/tmp/spec-stale-badge-smoke/testrepo`).
- `app.js` `isGitChange` branch has no `refreshWorktreeMetrics` call.
- `terminals.js` `onExit` handler has no `refreshWorktreeMetrics` call.
- `refreshRightPanel` itself never calls `refreshWorktreeMetrics`.

## Follow-ups (deferred work)

_None._

## Open questions

_None._

## Baseline verify (pre-implementation)

_Populated at end of Phase 2._

## Verification results (post-implementation)

_Populated in Phase 4._
