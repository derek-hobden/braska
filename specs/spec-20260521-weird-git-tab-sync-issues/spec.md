# Spec — weird git tab sync issues (#77)

Issue: [#77](https://github.com/derek-hobden/braska/issues/77) · PR: [#78](https://github.com/derek-hobden/braska/pull/78) · branch: `claude/issue-77` · started: 2026-05-21T00:00:00Z

**Status:** Implementation complete; pending final verify.

## Issue body

> quite often when i have pushed and created PRs for worktrees, in the git tab i still see buttons to push and commit or merge and its confusing. Either there is a logic error or i am misunderstanding or the UI is just not syncing with the latest state of git/github. investigate and fix

## Chosen approach

The root cause is a missing `_refreshChanges(workDir)` call after the PR create form in `renderer/github-prs.js` succeeds. The form calls `window.gitOps.pushSetUpstream` (push) and then `window.github.prCreate`, but on success only navigates to the PR list — it never tells the git changes panel to re-read git status. This leaves the "N unpushed" subtitle and the "Push"/"Push & Create PR" journey card visible even though the branch is already synced. The fix is: (1) call `_refreshChanges(workDir)` immediately after PR creation succeeds in `showGitHubPRForm`, and (2) export an `invalidatePRCache(workDir)` helper from `journey-zone.js` so the PR pill in the branch subtitle populates immediately rather than waiting out the 60 s cache TTL. The journey-zone's existing `onGithubSpecialistExit` already does this for the specialist-based flow; this change makes the manual form consistent with that.

## Assumptions

- ✓ **confident** — `window.gitOps.pushSetUpstream` updates `refs/remotes/origin/<branch>` on disk, so the next `git:status` call will return `pushAhead: 0`
  - _Basis (reproducer)_: see research.md → Verified tool behavior → "Claim 1"
  - Research finding: `git rev-list --left-right --count origin/feat...HEAD` returns `0    0` after simulated push

- ✓ **confident** — `_refreshChanges` is already injected into `github-prs.js` via `initGitHubPRs`
  - _Basis (file:line)_: `renderer/github-prs.js:8-15` — `_refreshChanges` is declared and populated from the init call; `renderer/app.js:280` confirms the dep is passed in

- ✓ **confident** — `_prCache` in `journey-zone.js` uses a 60 s TTL that prevents immediate re-query after PR creation
  - _Basis (file:line)_: `renderer/journey-zone.js:27` — `PR_CACHE_TTL_MS = 60 * 1000`; `ensurePRForBranch` skips the fetch when the entry is fresh

- ✓ **confident** — `onGithubSpecialistExit` (journey-zone.js:58-64) already invalidates the cache and refreshes; the manual form has no equivalent
  - _Basis (file:line)_: `renderer/journey-zone.js:58-64` and `renderer/github-prs.js:260-291` — the form calls neither

- ✓ **confident** — Adding a `refreshChanges` call after push+PR in the form will clear "N unpushed" from the subtitle and dismiss the "Push"/"Publish & PR" journey card
  - _Basis (file:line)_: `renderer/journey-cards.mjs:105-124` — "share" card only appears when `pushAhead > 0` or `!hasUpstream`; after push both conditions are false

## Definition of done

- After creating a PR via the PR form in the GitHub tab: the "N unpushed" indicator disappears from the branch subtitle within 1–2 s of the PR being created successfully
- The "Push" / "Push & Create PR" / "Publish & PR" journey card is gone after PR form submission
- The "PR #N" pill appears in the branch subtitle without a 60 s delay
- All 102 existing tests still pass

## Up-front tests

- `test/journey-cards.test.mjs::share card gone when pushAhead is 0 and hasUpstream is true` — verifies that computeJourneyCards returns no "share" card (no push/publish buttons) after a successful push+PR, i.e. when `pushAhead === 0 && hasUpstream === true`

## Tasks

Statuses: `- [ ]` pending, `- [x]` done, `- [ ] ~~text~~ — deferred: <reason>` deferred.

- [x] Add test: no share card when `pushAhead === 0 && hasUpstream === true && branch is feature branch`
  - _Story: As the test suite, when push has completed (pushAhead=0, hasUpstream=true), then computeJourneyCards returns no "share" card._
  - _test: `test/journey-cards.test.mjs::no share card when fully pushed with upstream`_

- [x] Export `invalidatePRCache(workDir)` from `renderer/journey-zone.js`
  - _Story: As the PR form, after PR creation I can clear the journey-zone PR cache so the pill appears immediately._
  - _test: n/a (tested via integration of the next task)_

- [x] Call `invalidatePRCache` and `_refreshChanges` after PR creation success in `renderer/github-prs.js`
  - _Story: As a user, after I create a PR via the form, the git tab immediately reflects the pushed state (no "N unpushed", no Push card)._
  - _test: `test/journey-cards.test.mjs::no share card when fully pushed with upstream`_

## Verify

```bash
node --test
```

## Decisions

_Appended chronologically as implementation reveals choices._

## Don'ts (rejected approaches and disproved assumptions)

- **Rejected: fs.watch on `.git/refs/remotes/`** — CLAUDE.md documents a 2026-03-29 infinite-refresh bug from fs.watch inside list handlers; research.md confirms this was rejected for the same issue previously.
- **Rejected: generic `git:state-changed` IPC broadcast** — More architectural but significantly more scope (main/git-ops.js, main/github.js, preload.js, renderer). YAGNI: the single missing `refreshChanges` call is the cause of the reported issue. The broadcast pattern can be a follow-up if other callers show the same gap.

## Course corrections

_When the spec was wrong and how it was updated, with timestamp._

## Subagent notes

Research subagent identified: root cause is missing `_refreshChanges()` in `showGitHubPRForm` success handler (github-prs.js:281); `onGithubSpecialistExit` already handles the specialist-based flow identically. Background fetch every 5 min is the only current fallback (git-fetcher.js:14,64-70).

## Follow-ups (deferred work)

- Consider adding a generic `git:state-changed` IPC broadcast to cover external git operations (CLI, other tools) — architectural improvement, not needed for this bug fix.

## Open questions

_None._

## Baseline verify (pre-implementation)

_Populated at end of Phase 2._

## Verification results (post-implementation)

_Populated in Phase 4._
