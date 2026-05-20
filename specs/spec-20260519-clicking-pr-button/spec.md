# Spec — clicking the PR button (#54)

Issue: [#54](https://github.com/derek-hobden/braska/issues/54) · PR: [#57](https://github.com/derek-hobden/braska/pull/57) · branch: `claude/issue-54` · started: 2026-05-19T18:45:00Z

**Status:** Spec drafted; implementation not started.

## Issue body

> clicking the PR button form the git tab takes me to the github tab, then i have to select the pr. it should immediately go into the pr that i clicked.

## Chosen approach

Use a `ghState.directPRNumber` sentinel — the same pattern already used by `openIssueInPanel` / `ghState.directIssueNumber` / `refreshGitHubIssues`. When the user clicks a PR pill, set `ghState.directPRNumber = number` on `ghState`, then call `_switchToGitHubView`. Inside `refreshGitHubPRs`, check the sentinel before any `await`; if set, consume it and call `showGitHubPRDetail` directly, bypassing the list fetch entirely. The current code uses `setTimeout(..., 100)` instead, which races against the async `window.github.prList` IPC call and frequently loses. The sentinel approach is race-free because it is read synchronously before the first `await` in `refreshGitHubPRs`.

## Assumptions

- ✓ **confident** — `switchRightPanelTab('github')` calls `_refreshGitHub` synchronously, which calls `refreshGitHub`, which calls `refreshGitHubPRs` synchronously before any `await`
  - _Basis (file:line)_: `renderer/file-explorer.js:170`, `renderer/github-panel.js:131` — the call chain has no `await` between `switchRightPanelTab` and `refreshGitHubPRs`'s first line

- ✓ **confident** — setting `ghState.directPRNumber` before `_switchToGitHubView` guarantees the sentinel is readable at the top of `refreshGitHubPRs`
  - _Basis (file:line)_: `renderer/journey-zone.js:332` — assignment is synchronous JavaScript; no event loop turn between assignment and `refreshGitHubPRs` entry

- ✓ **confident** — `showGitHubPRDetail` is exported from `renderer/github-prs.js` and can be called directly within that module
  - _Basis (file:line)_: `renderer/github-prs.js:75` — `export async function showGitHubPRDetail`

- ✓ **confident** — `ghState` is imported in `renderer/journey-zone.js` already
  - _Basis (file:line)_: `renderer/journey-zone.js:5` — `import { tabState, gitState, ghState } from './state.js'`

- ✓ **confident** — `refreshGitHubIssues` implements the identical sentinel pattern with `directIssueNumber`, confirming the approach works end-to-end in this codebase
  - _Basis (file:line)_: `renderer/github-issues.js:28-32`

- ✓ **confident** — `github-panel.js` has exactly three places where `ghState.directIssueNumber = null` is set (auth failure, not-a-github-repo, and subnav click); each must gain a matching `directPRNumber = null`
  - _Basis (file:line)_: `renderer/github-panel.js:87` (auth failure), `renderer/github-panel.js:106` (not-a-github-repo), `renderer/github-panel.js:126` (subnav click handler)

## Definition of done

- Clicking a PR pill in the git changes panel navigates directly to that PR's detail view in the GitHub panel without the user needing to click again
- Clicking subnav buttons (PRs, Issues, CI, Notifications) inside the GitHub panel continues to load the list view as before (sentinel is cleared on subnav click)
- The PR detail view is not shown if the repo is unauthenticated or not a GitHub repo (sentinel is cleared on auth/repo failure)

## Up-front tests

No new automated test added. The renderer changes depend on DOM APIs (`document.getElementById`, `content.innerHTML`) and IPC (`window.github.prList`) that have no mock infrastructure in the current test suite. The behavioral fix is verifiable by reading the code: the sentinel is consumed before the first `await` in `refreshGitHubPRs`, so the race condition is structurally eliminated. Adding meaningful tests would require a DOM+IPC mock harness that doesn't exist and would be disproportionate to the change.

## Tasks

Statuses: `- [ ]` pending, `- [x]` done, `- [ ] ~~text~~ — deferred: <reason>` deferred.

- [ ] **▶ Active** — Add `directPRNumber: null` to `ghState` in `renderer/state.js`
  - _Story: As a reader of state.js, I can see all ghState fields documented in one place._
  - _test: n/a (declaration only)_

- [ ] — Replace `setTimeout` in `journey-zone.js` `open-pr` handler with sentinel assignment
  - _Story: As the app, when handling `open-pr`, I set `ghState.directPRNumber` before switching views so the sentinel is available synchronously._
  - _test: n/a (renderer event handler; no DOM mock infrastructure)_

- [ ] — Add `directPRNumber` early-return guard at top of `refreshGitHubPRs` in `renderer/github-prs.js`
  - _Story: As the PR list loader, when `directPRNumber` is set, I navigate directly to that PR and skip the list fetch._
  - _test: n/a (requires DOM + IPC mocks)_

- [ ] — Clear `ghState.directPRNumber` in the three cancel-sentinel sites in `renderer/github-panel.js`
  - _Story: As the GitHub panel, when I show the auth error, not-a-github-repo notice, or process a subnav click, I clear the directPRNumber sentinel so it doesn't fire unexpectedly later._
  - _test: n/a (renderer event handler; no DOM mock infrastructure)_

## Verify

```bash
node --test test/git-pull.test.js test/git-worktree.test.js test/journey-cards.test.mjs
```

Note: `npm test` (which runs `node --test test/`) fails pre-existing with "Cannot find module '/home/user/braska/test'" — a directory-as-module resolution issue unrelated to this change. The individual test files pass.

## Decisions

_Appended chronologically as implementation reveals choices._

## Don'ts (rejected approaches and disproved assumptions)

- **Don't use `setTimeout` to sequence async renderer navigation.** The IPC call in `refreshGitHubPRs` takes longer than any reasonable fixed delay; use the sentinel pattern instead.
- **Don't thread a callback through `refreshGitHub` / `refreshGitHubPRs`.** Would require changing the call signature across the whole `switchRightPanelTab` → `_refreshGitHub` → `refreshGitHub` → `refreshGitHubPRs` chain — disproportionate for identical end behavior.

## Course corrections

_When the spec was wrong and how it was updated, with timestamp._

## Subagent notes

Research subagent confirmed the `setTimeout` race condition in `journey-zone.js:333` and identified the `directIssueNumber` pattern in `github-issues.js:28-32` as the template to follow. All four files to touch were identified before implementation began.

## Follow-ups (deferred work)

_None._

## Open questions

_None._

## Baseline verify (pre-implementation)

_Populated at end of Phase 2._

## Verification results (post-implementation)

_Populated in Phase 4._
