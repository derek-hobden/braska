# Spec — PR status (#56)

Issue: [#56](https://github.com/derek-hobden/braska/issues/56) · PR: [#63](https://github.com/derek-hobden/braska/pull/63) · branch: `claude/issue-56` · started: 2026-05-19T00:00:00Z

**Status:** Complete.

## Issue body

> To the right of the worktree name in the project viewer panel, if a pr is open, i would like to see a red x if the checks failed, or a green tick if the checks all passed.

## Chosen approach

Extend the existing `gh:pr-for-branch` IPC handler to include `statusCheckRollup` in its `gh pr list --json` fields. In `refreshWorktreeMetrics`, after building the git metric badges for each non-main worktree, call `window.github.prForBranch(wtPath)` and render a colored CI badge (`✓` / `✗` / `…`) into the `.wt-metrics` span. A new pure function `prCheckStatus(rollup)` in `renderer/utils.js` collapses the rollup array into `'pass' | 'fail' | 'pending' | null`, correctly handling both `CheckRun` and `StatusContext` item types (the existing `ghChecksBadge` in `github-panel.js` misclassifies `StatusContext` items with `state:'SUCCESS'` as pending). No new IPC channel or preload bridge is needed — `window.github.prForBranch` is already exposed. This approach was chosen over a dedicated IPC handler (YAGNI — two callers don't warrant extraction) and over a full `gh:pr-list`-based scatter (too heavy for a per-worktree badge).

## Assumptions

- ✓ **confident** — `statusCheckRollup` is a valid JSON field for `gh pr list`
  - _Basis (file:line)_: `main/github.js:94` — already used in `gh:pr-list` handler's `--json` argument

- ✓ **confident** — `statusCheckRollup` items use uppercase enum values (`FAILURE`, `SUCCESS`, `PENDING`, etc.)
  - _Basis (file:line)_: `renderer/github-panel.js:29` — `c.conclusion === 'FAILURE'`; `renderer/github-prs.js:114` — `c.conclusion === 'SUCCESS'`; these are in production use

- ✓ **confident** — `window.github.prForBranch` is already exposed to the renderer
  - _Basis (file:line)_: `preload.js:122` — `prForBranch: (workDir) => ipcRenderer.invoke('gh:pr-for-branch', workDir)`

- ✓ **confident** — `refreshWorktreeMetrics` is called every ~5 min automatically via `git:fetched`
  - _Basis (file:line)_: `renderer/app.js:230-235` — `window.gitOps.onFetched(() => { ... refreshWorktreeMetrics(); ... })`

- ✓ **confident** — The existing `ghChecksBadge` incorrectly marks `StatusContext{state:'SUCCESS'}` as pending
  - _Basis (reproducer)_: `github-panel.js:30` — `const pending = rollup.some(c => !c.conclusion || ...)` — for a `StatusContext` item, `c.conclusion` is `undefined`, so `!c.conclusion` is `true`, causing any `StatusContext` item (regardless of `state`) to trigger the pending branch

- ✓ **confident** — `refreshWorktreeMetrics` iterates per project and per worktree; non-main worktrees are distinguishable via `m.isMain`
  - _Basis (file:line)_: `renderer/sidebar.js:97-120` — loop has `m.isMain` check for the stale indicator; same field can gate the PR call

## Definition of done

- In the sidebar, a worktree row for a branch that has an open PR with all checks passing shows a green `✓` badge to the right of the existing metric badges.
- A worktree row for a branch with a failing/errored check shows a red `✗` badge.
- A worktree row for a branch with in-progress checks shows a dimmed `…` badge.
- A worktree row with no open PR, or a PR with no CI configured, shows no CI badge.
- Main worktree rows are not queried (main typically has no PR).
- The badge refreshes automatically every ~5 minutes alongside the existing git metrics.

## Up-front tests

- `test/github.test.js::prCheckStatus — returns null for empty rollup`
- `test/github.test.js::prCheckStatus — returns pass when all CheckRuns succeeded`
- `test/github.test.js::prCheckStatus — returns fail on FAILURE conclusion`
- `test/github.test.js::prCheckStatus — returns fail on ERROR conclusion`
- `test/github.test.js::prCheckStatus — returns pending when a CheckRun has no conclusion`
- `test/github.test.js::prCheckStatus — returns pass for StatusContext with state SUCCESS (regression for ghChecksBadge bug)`
- `test/github.test.js::prCheckStatus — returns fail for StatusContext with state FAILURE`
- `test/github.test.js::prCheckStatus — returns pending for StatusContext with state PENDING`
- `test/github.test.js::gh:pr-for-branch includes statusCheckRollup in gh invocation`

## Tasks

Statuses: `- [ ]` pending, `- [x]` done, `- [ ] ~~text~~ — deferred: <reason>` deferred.

- [x] — Add `prCheckStatus(rollup)` to `renderer/utils.js` with tests
  - _Story: As the sidebar, when I call prCheckStatus(rollup), then I get 'pass'/'fail'/'pending'/null correctly for both CheckRun and StatusContext items._
  - _test: `test/github.test.js` — prCheckStatus suite_
- [x] — Extend `gh:pr-for-branch` to include `statusCheckRollup`
  - _Story: As the renderer, when I call window.github.prForBranch(path), then the returned pr object includes statusCheckRollup._
  - _test: `test/github.test.js` — gh:pr-for-branch includes statusCheckRollup_
- [x] — Add CI badge rendering to `refreshWorktreeMetrics` in `renderer/sidebar.js`
  - _Story: As a user, when I look at the sidebar, then I see a green ✓, red ✗, or dimmed … next to worktree rows that have an open PR with CI results._
  - _test: visual / manual_
- [x] — Add `.wt-metric.ci-pass`, `.wt-metric.ci-fail`, `.wt-metric.ci-pending` CSS rules to `styles.css`
  - _Story: As a user, the CI badge is distinctly colored (green/red/dimmed) consistent with the existing metric badge style._
  - _test: visual / manual_

## Verify

```bash
node --test test/github.test.js test/git-worktree.test.js test/git-pull.test.js test/journey-cards.test.mjs
```

## Decisions

_Appended chronologically as implementation reveals choices._

## Don'ts (rejected approaches and disproved assumptions)

_What was tried and discarded, with the reason._

## Course corrections

_When the spec was wrong and how it was updated, with timestamp._

## Subagent notes

Research subagent findings summarised in `research.md`. Key finding: `ghChecksBadge` in `github-panel.js` has a latent bug where `StatusContext` items with `state:'SUCCESS'` are classified as pending; the new `prCheckStatus` in `utils.js` fixes this.

## Follow-ups (deferred work)

_Tasks marked deferred during implementation, with reasons._

## Open questions

_None._

## Baseline verify (pre-implementation)

_Populated at end of Phase 2._

## Verification results (post-implementation)

_Populated in Phase 4._
