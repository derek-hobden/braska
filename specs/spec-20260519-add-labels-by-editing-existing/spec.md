# Spec — add labels by editing existing issue (#59)

Issue: [#59](https://github.com/derek-hobden/braska/issues/59) · PR: [#60](https://github.com/derek-hobden/braska/pull/60) · branch: `claude/issue-59` · started: 2026-05-19T00:00:00Z

**Status:** Implementation complete; verifying.

## Issue body

> from the github issues tab, if i edit an issue, i want the ability to apply labels there

## Chosen approach

The label editing backend (IPC handlers, preload bridge) and the renderer logic (chip UI, picker, save diff) are already fully implemented as of commit `cd8f813`. The only gap is UX discoverability: the `.gh-edit-labels-region` div is placed inside `.gh-detail-header` — the same single-line flex row as the "← Issues" button and the state badge — making it easy to miss. The fix is to move that div out of the header and into a dedicated "Labels" section rendered below the body textarea when in edit mode, creating parity with the create form's `<label>Labels</label>` section in `github-issues-create.js`. No backend changes are needed.

## Assumptions

- ✓ **confident** — `window.github.issueLabels` and `window.github.issueEdit` are already wired up and functional.
  - _Basis (file:line)_: `preload.js:130,134` — both IPC channels exposed; `main/github.js:241-270` — handlers implemented.

- ✓ **confident** — `wireEditLabelHandlers` uses `document.querySelector('.gh-edit-labels-region')` to find the region, so moving the element to a different location in the DOM does not break the handler.
  - _Basis (file:line)_: `renderer/github-issues.js:369` — `const region = document.querySelector('.gh-edit-labels-region')`.

- ✓ **confident** — `renderLabelsRegion(issue, false)` (view mode) only emits `ghLabelHtml` chips and does not reference `editDraft`, so it is safe to call with `isEditing=false` in the header for the view-mode path.
  - _Basis (file:line)_: `renderer/github-issues.js:348-365` — the `if (isEditing)` branch reads `editDraft`; the `else if` branch does not.

- ✓ **confident** — Moving the region out of the header in edit mode does not require changes to `saveIssueEdit`, `openLabelPicker`, or the IPC handlers.
  - _Basis (file:line)_: `renderer/github-issues.js:416-445` — `saveIssueEdit` reads `editDraft` directly, not from the DOM; `openLabelPicker` queries `document.getElementById('gh-issue-label-picker')` which is inside the region.

## Definition of done

- Opening an issue in the GitHub Issues tab and clicking "Edit" shows a clearly labelled "Labels" section below the body textarea with chips for current labels and a "+ Add label" button.
- Adding a label via the picker and saving updates the issue on GitHub.
- Removing a label chip and saving removes the label on GitHub.
- In read mode (not editing), labels still appear in the detail header as before.
- `npm run lint` (if defined) and `node --test 'test/*.test.js' 'test/*.test.mjs'` pass.

## Up-front tests

No new unit tests required — the changed code is DOM manipulation with no pure-function logic to unit-test. The existing test suite (`test/git-worktree.test.js`, `test/git-pull.test.js`, `test/journey-cards.test.mjs`) covers unrelated subsystems and should remain green.

## Tasks

- [x] Move label editing region from detail header to dedicated section below body textarea in edit mode
  - _Story: As a user, when I click "Edit" on an issue, then I see a clearly-labelled "Labels" section below the body text area where I can add and remove labels._
  - _Changes:_ `renderer/github-issues.js` — `showGitHubIssueDetail`: render `gh-edit-labels-region` in a new `gh-edit-labels-section` div after the body textarea instead of inside the header. Keep header labels for view mode unchanged.
  - _Changes:_ `styles.css` — add `.gh-edit-labels-section` and `.gh-edit-label-caption` styles.

## Verify

```bash
node --test 'test/*.test.js' 'test/*.test.mjs'
```

## Decisions

_Appended chronologically as implementation reveals choices._

## Don'ts (rejected approaches and disproved assumptions)

- Do not replace the picker popup with an eager checkbox list — that adds a round-trip on every edit entry and is a larger change than the issue warrants (approach 3 from research).
- Do not add a standalone "Edit labels" button in view mode — splits the edit surface unnecessarily (approach 4 from research).

## Course corrections

_When the spec was wrong and how it was updated, with timestamp._

## Subagent notes

Research subagent confirmed: the backend and renderer label-editing logic is complete; gap is purely UX/discoverability in the header placement.

## Follow-ups (deferred work)

_None at this time._

## Open questions

_None — approach is unambiguous and does not require human input before proceeding._

## Baseline verify (pre-implementation)

_Populated at end of Phase 2._

## Verification results (post-implementation)

_Populated in Phase 4._
