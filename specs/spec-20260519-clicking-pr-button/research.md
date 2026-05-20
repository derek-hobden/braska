# Research — clicking the PR button (#54)

## Problem summary

When a user clicks a PR pill in the git changes panel, the handler switches to the GitHub panel tab (triggering `refreshGitHubPRs` to load the full PR list) and then schedules `showGitHubPRDetail` 100ms later via `setTimeout`. Because `refreshGitHubPRs` makes an async IPC call (`window.github.prList`) that typically takes longer than 100ms, the detail view render races against and is frequently overwritten by the arriving list data, leaving the user on the PR list rather than the specific PR.

## Approaches considered

### Approach A: `ghState.directPRNumber` sentinel (mirror the issue pattern)

Set `ghState.directPRNumber = number` before calling `_switchToGitHubView`, then check and consume it at the top of `refreshGitHubPRs`, short-circuiting to `showGitHubPRDetail` — the same guard that `refreshGitHubIssues` uses with `ghState.directIssueNumber`.

- **Pros:** Zero timing assumptions; the sentinel is consumed exactly once before any list fetch begins; mirrors a proven in-repo pattern (`openIssueInPanel` → `directIssueNumber`); no signature changes.
- **Cons:** Adds one more field to `ghState`; requires null-out guards in `github-panel.js` to match existing `directIssueNumber` clears.
- **Precedent:** `openIssueInPanel` → `ghState.directIssueNumber` → `refreshGitHubIssues` short-circuit (`renderer/github-issues.js:28-32`, `renderer/app.js:252-253`, `renderer/github-panel.js:87,106,126`).

### Approach B: Skip `refreshGitHub` entirely

Set `ghState.section = 'prs'`, switch tab but suppress the refresh, then call `showGitHubPRDetail` directly.

- **Pros:** Fewer IPC calls.
- **Cons:** `switchRightPanelTab('github')` unconditionally calls `_refreshGitHub`; suppressing it would require refactoring the tab switch or bypassing the auth check flow that renders the subnav scaffold. The detail view writes into `#gh-content` which only exists after `refreshGitHub` has rendered the subnav.

### Approach C: Increase the `setTimeout` delay

Raise 100ms to e.g. 500ms.

- **Pros:** Trivial.
- **Cons:** Fragile — IPC latency is variable. Still a race condition; adds perceptible jank.

### Approach D: Pass a callback into `refreshGitHubPRs`

Add an `onReady` callback parameter that fires once the scaffold is ready, calling `showGitHubPRDetail` from it.

- **Pros:** No global sentinel state.
- **Cons:** Changes the signature of `refreshGitHubPRs`, `refreshGitHub`, and the whole call chain up through `switchRightPanelTab` → `_refreshGitHub`. Significantly more surface area than the sentinel pattern for identical end behavior.

## Recommended approach

**Approach A: `ghState.directPRNumber` sentinel.**

Established codebase pattern, fixes the race without timing assumptions, minimal diff:

1. `renderer/state.js`: add `directPRNumber: null` to `ghState`.
2. `renderer/journey-zone.js` (`_handleJourneyAction`, `'open-pr'` branch): replace `_switchToGitHubView` + `setTimeout(showGitHubPRDetail, 100)` with setting `ghState.directPRNumber = number` then calling `_switchToGitHubView(true, { section: 'prs' })`.
3. `renderer/github-prs.js` (`refreshGitHubPRs`): add early-return guard at the top, identical to `refreshGitHubIssues` lines 28-32.
4. `renderer/github-panel.js`: add `ghState.directPRNumber = null` alongside the three existing `ghState.directIssueNumber = null` lines (lines ~87, 106, 126).

## Verified tool behavior

No external behavior assumptions made. The fix is entirely within the renderer's synchronous-before-await flow.

Verified by reading the code:

- `switchRightPanelTab('github')` (`file-explorer.js:170`) calls `_refreshGitHub?.(activeWorkDir())` synchronously.
- `refreshGitHub` (`github-panel.js`) builds the subnav scaffold and calls `refreshGitHubPRs` synchronously until the first `await` in `refreshGitHubPRs`.
- The `ghState.directPRNumber` check (when added) will fire before the `window.github.prList` await, eliminating the race.
- Identical structure in `refreshGitHubIssues` lines 28-32 confirms the pattern works.

## Unknowns

- Whether `directIssueNumber` being undeclared in `state.js` was intentional — consistent either way; recommending adding `directPRNumber` to `state.js` for clarity.
- The PR pill (`getCachedPRPillHtml`) is the only "PR button from the git tab" in the current code. If the user meant a journey-zone card "Push & Create PR" button, that fires `push-pr` (not `open-pr`) and doesn't navigate to an existing PR at all — separate feature. Assuming the pill is the element in question.

## Files inventory

- `renderer/journey-zone.js` — contains the `open-pr` action handler with the broken `setTimeout` pattern; needs sentinel assignment.
- `renderer/github-prs.js` — contains `refreshGitHubPRs`; needs the `directPRNumber` early-return guard.
- `renderer/github-panel.js` — has three `ghState.directIssueNumber = null` lines that each need a matching `ghState.directPRNumber = null`.
- `renderer/state.js` — declares `ghState`; `directPRNumber: null` should be added.
- `renderer/github-issues.js` — the existing `directIssueNumber` implementation (lines 28-32) is the template.
- `renderer/app.js` — wires `initJourneyZone` with `showGitHubPRDetail` at line 271; no changes needed.
- `renderer/file-explorer.js` — `switchRightPanelTab` (line 170) triggers `_refreshGitHub` unconditionally; confirms Approach B would require invasive changes.
