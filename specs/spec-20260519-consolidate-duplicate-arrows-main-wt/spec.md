# Spec — consolidate duplicate ⇣N arrows on main worktree row (#64)

Issue: [#64](https://github.com/derek-hobden/braska/issues/64) · PR: [#65](https://github.com/derek-hobden/braska/pull/65) · branch: `claude/issue-64` · started: 2026-05-19T00:00:00Z

**Status:** Implementing.

## Issue body

> ## Problem
>
> When the main worktree is checked out to the default branch (the typical setup), two visually identical ⇣N arrows show up next to its name in the sidebar:
>
> - **Purple ⇣N** (`.unpulled`) — `origin/` is ahead of HEAD. Rendered by `divergenceBadges` in `renderer/utils.js:329-332` from `m.pushBehind`.
> - **Orange ⇣N** (`.stale`) — `origin/main` is ahead of local `main`. Rendered in `renderer/sidebar.js:112-115` from `m.mainStale.originAhead`.
>
> For the main worktree on the default branch these describe the exact same commits, so the user sees `⇣2 ⇣2` and has to hover both tooltips to figure out they're redundant.
>
> ## Proposal
>
> On the main worktree row, show **one** arrow with the "your baseline is stale, pull to update" framing (currently the orange one). Suppress the purple `⇣N` (`pushBehind`) when `isMain && wt.branch === defaultBranch` so it doesn't duplicate the stale indicator.
>
> Behavior on non-main worktrees and feature branches stays unchanged — purple ⇣N still means "this branch trails its remote".
>
> ## Edge case
>
> If the main worktree is checked out to something other than the default branch (unusual but possible), keep both arrows since they then measure different things.

## Chosen approach

Add `branch` to the per-worktree metrics object in `main/git-read.js`, then suppress `pushBehind` in `renderer/sidebar.js` before calling `divergenceBadges` when `m.isMain && m.branch === m.mainStale?.branch`. This is the only approach that correctly handles the edge case: when the main worktree is on a feature branch, `mainStale.originAhead` (default branch vs origin) and `pushBehind` (feature branch vs origin) are independent metrics that must both be shown.

## Assumptions

- ✓ **confident** — `wt.branch` in the worktree object from `getGitInfo` is the short branch name without any ref prefix (e.g. `'main'`, not `'refs/heads/main'`)
  - _Basis (file:line)_: `main/projects.js:58` — `wt.branch = line.slice(7).replace('refs/heads/', '')` strips the prefix before storing

- ✓ **confident** — `mainStale.branch` from `detectDefaultBranch` is also a bare short name
  - _Basis (file:line)_: `main/git-read.js:8` — `stdout.trim().replace('refs/remotes/origin/', '')` strips the prefix; result is e.g. `'main'`

- ✓ **confident** — when main worktree is on default branch, `pushBehind` and `mainStale.originAhead` always count the same commits
  - _Basis (file:line)_: `main/git-read.js:195-201` — `pushBehind` = `rev-list origin/${wt.branch}...HEAD` = commits origin/main is ahead of HEAD; `main/git-read.js:163` — `mainStale.originAhead` = same query anchored at the project root. When `wt.branch === defaultBranch` and HEAD = local main, these resolve identically.

- ✓ **confident** — the `m` object in the metrics array currently does NOT include `wt.branch`
  - _Basis (file:line)_: `main/git-read.js:173` — object literal lists `path, changed, untracked, ahead, behind, pushAhead, pushBehind, mainStale, isMain`; `branch` is absent

## Definition of done

- On the main worktree row when origin is ahead: only the orange ⇣N (`.stale`) appears; the purple ⇣N (`.unpulled`) is absent.
- On a non-main worktree: purple ⇣N still appears when origin is ahead of that branch.
- If the main worktree is checked out to a feature branch: both arrows are preserved (they measure different things).
- `npm test` passes.

## Up-front tests

- `test/git-worktree-metrics.test.js::suppresses pushBehind on main worktree when on default branch` — verifies metrics returns `branch` field; sidebar logic tested via unit test of the conditional

## Tasks

- [x] **▶ Active** — add `branch` field to metrics object in `main/git-read.js`
  - _Story: As the renderer, when I receive worktree metrics, I can compare the worktree's branch to the default branch without a separate IPC call._
  - _test: `test/git-worktree-metrics.test.js::metrics include branch field`_
- [x] suppress `pushBehind` badge on main worktree when on default branch (`renderer/sidebar.js`)
  - _Story: As a user, when origin/main has N new commits, I see exactly one ⇣N on the main worktree row, not two._
  - _test: covered by visual inspection; no unit test for pure rendering logic_

## Verify

```bash
npm test
```

## Decisions

2026-05-19: Chose to surface `branch` in the metrics object rather than add a flag to `divergenceBadges` — keeps the general utility free of caller-specific logic.

2026-05-19: Suppression is done by constructing `mForBadges = { ...m, pushBehind: 0 }` inline in the sidebar rather than mutating `m` — `m` is also used for the file badges and stale check, and mutating a received object is surprising.

## Don'ts (rejected approaches and disproved assumptions)

- Using `m.isMain && m.mainStale?.originAhead > 0` alone as the suppression condition: incorrect for the edge case where main worktree is on a feature branch. Both `mainStale.originAhead` and `pushBehind` can be independently non-zero and mean different things.

## Course corrections

_none_

## Subagent notes

_none_

## Follow-ups (deferred work)

_none_

## Open questions

_none_

## Baseline verify (pre-implementation)

_Populated at end of Phase 2._

## Verification results (post-implementation)

_Populated in Phase 4._
