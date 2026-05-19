# Spec — github notifications dot (#61)

Issue: [#61](https://github.com/derek-hobden/braska/issues/61) · PR: [#62](https://github.com/derek-hobden/braska/pull/62) · branch: `claude/issue-61` · started: 2026-05-19T19:00:00Z

**Status:** Implementation complete; verifying.

## Issue body

> get rid of the little notification dot that shows by the github icon next to the worktree names. i dont care about github notifications and the dot distracts me.

## Chosen approach

Remove the GitHub activity dot entirely from all three layers: the JS that fetches notifications and sets `has-activity`, the exported helper `clearGitHubBadgeForWorkDir` (and its import/call in `github-panel.js`), and the CSS `::after` pseudo-element that renders the orange circle. This leaves no dead code and eliminates the IPC call to `window.github.notifications()` during badge refresh.

## Assumptions

- ✓ **confident** — `clearGitHubBadgeForWorkDir` is only called from `github-panel.js:316` and nowhere else.
  - _Basis (reproducer)_: `grep -rn "clearGitHubBadgeForWorkDir" /home/user/braska/renderer/ /home/user/braska/main/` → two hits: the export definition at `renderer/sidebar.js:132` and the import+call in `renderer/github-panel.js:9,316`.

- ✓ **confident** — `window.github.notifications()` inside `refreshProjectBadges` is the only IPC call for the badge dot; removing it leaves badge refresh otherwise intact (todos badge is independent).
  - _Basis (file:line)_: `renderer/sidebar.js:162–171` — the two badge blocks (todos and github) are independent try/catch blocks.

- ✓ **confident** — The `has-activity` CSS class is only used by `.project-section-badge.has-activity::after` in `styles.css` and is not referenced anywhere else.
  - _Basis (reproducer)_: `grep -rn "has-activity" /home/user/braska/` → only `renderer/sidebar.js:140,168`, `renderer/github-panel.js` (indirectly via `ghState.hasActivity` which is a separate local variable), and `styles.css:301`.

## Definition of done

- No orange dot appears next to the GitHub icon in the sidebar's project-level section links.
- The GitHub section link itself still works (clicking it opens the GitHub panel).
- No JS errors related to missing exports.
- `npm test` passes.

## Up-front tests

No new unit tests — the existing test suite covers main-process Node code; renderer DOM changes are not tested at that layer. The change is verified by `npm test` (no regressions) plus manual inspection.

## Tasks

- [x] Remove GitHub activity dot (sidebar.js, github-panel.js, styles.css)
  - _Story: As a user, when I look at the sidebar, I see no orange dot next to the GitHub icon._
  - _test: `npm test` exits 0 (no regressions)_

## Verify

```bash
npm test
```

## Decisions

_Appended chronologically as implementation reveals choices._

## Don'ts (rejected approaches and disproved assumptions)

_None yet._

## Course corrections

_None yet._

## Subagent notes

_None — research done inline._

## Follow-ups (deferred work)

_None._

## Open questions

_None._

## Baseline verify (pre-implementation)

_Populated at end of Phase 2._

## Verification results (post-implementation)

_Populated in Phase 4._
