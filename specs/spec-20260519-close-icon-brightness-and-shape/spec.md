# Spec — close icon (#44)

Issue: [#44](https://github.com/derek-hobden/braska/issues/44) · PR: [#45](https://github.com/derek-hobden/braska/pull/45) · branch: `claude/issue-44` · started: 2026-05-19T00:00:00Z

**Status:** Complete; ready for review.

## Issue body

> the X to close project should be brighter, same as other symbols next to it (the todo icon and the github icon). it's currently too dark against the background and its just generally bad practice. also, perhaps we can change the icon to an x in a circle, the other icons are also circular so that would look nice.

## Chosen approach

Replace the `&times;` text character in `.remove-btn` with a 14×14 XCircle SVG (a circle with a diagonal cross inside, matching the circular motif of the adjacent todo/github icons), and align its resting opacity/color with `.project-section-link` (opacity 0.5, color #666 at rest; opacity 1 on project-item hover). The red destructive hover cue (`color: #e55; background: #2a1515`) is preserved. This approach was chosen over a CSS-only fix because the `&times;` text character looks visually inconsistent next to SVG peers, and over a shared-class approach because coupling the button's styling to the link class would create silent breakage on future link style changes. The XCircle pattern directly follows the `SVG_TODO` / `SVG_GITHUB` constants already in `renderer/sidebar.js`.

## Assumptions

- ✓ **confident** — The red hover colour on the remove button is intentional and should be kept: it is the only destructive action in the project row.
- ✓ **confident** — The neighbouring icons (todo, github) are 14×14 SVGs; the new close icon should match that size.
- ✓ **confident** — The button element type (`<button>`) is correct and should not change.
- ✓ **confident** — No tests cover the sidebar HTML output; test suite is `node --test` over main-process modules only.

## Definition of done

- The remove-project button in the sidebar shows an XCircle SVG (not `×` text) next to the todo/github icons.
- At rest (project not hovered), the icon is visible at the same brightness as the todo/github icons.
- On project-item hover, the icon brightens to full opacity (same as todo/github).
- On direct button hover, the icon turns red with a dark-red background (destructive affordance preserved).
- `npm test` exits 0.

## Up-front tests

_No test file needed — the test suite covers main-process IPC only; renderer HTML is not unit-tested. Change is verified by visual inspection and the verify block below._

## Tasks

Statuses: `- [ ]` pending, `- [x]` done, `- [ ] ~~text~~ — deferred: <reason>` deferred.

- [x] — Add `SVG_CLOSE` XCircle constant and update remove-btn HTML in `renderer/sidebar.js`
  - _Story: As a user, when I look at the project row, the remove button shows a circle-X icon consistent with the todo and github icons._
- [x] — Update `.remove-btn` CSS in `styles.css` to match `project-section-link` brightness
  - _Story: As a user, the remove button is as visible as the todo/github icons at rest, and brightens on hover._

## Verify

```bash
npm test
```

## Decisions

_Appended chronologically as implementation reveals choices._

## Don'ts (rejected approaches)

- **CSS-only fix (keep `&times;` text):** Partially satisfies the issue but leaves the text character visually inconsistent with SVG peers. Rejected.
- **Share `.project-section-link` class:** Silently couples button styling to link contract. Rejected.

## Course corrections

_None._

## Subagent notes

_Research performed inline; no subagent needed for this scope._

## Follow-ups (deferred work)

_None._

## Open questions

_None._

## Baseline verify (pre-implementation)

_Populated at end of Phase 2._

## Verification results (post-implementation)

_Populated in Phase 4._
