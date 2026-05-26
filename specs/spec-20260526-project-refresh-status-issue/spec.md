# Spec — Project refresh status issue (#82)

Issue: [#82](https://github.com/derek-hobden/braska/issues/82) · PR: [#83](https://github.com/derek-hobden/braska/pull/83) · branch: `claude/issue-82` · started: 2026-05-26T18:00:00Z

**Status:** Complete. All verify commands pass, no deferred tasks, no uncertain assumptions.

## Issue body

> When claude creates a new worktree, the worktree shows in the left projects panel correctly, but the blue and green status dots go aaway. only if i click on a different worktree (and not main) do they all come back

## Chosen approach

Call `updateNotifUI()` once in `loadProjects()` after the DOM is rebuilt and visual state is restored. The "blue dot" is `.worktree-item.has-notification::after` (blue circle, 6px) and the "green dot" is `.worktree-item.has-busy::after` (green pulsing circle, 6px); both classes are applied by `updateNotifUI()` in `notifications.js` using in-memory state (`busyTabs`, `notifActivity`) that survives the DOM rebuild. `updateNotifUI` is already imported at the top of `sidebar.js` so no import change is needed. The alternative of adding a periodic re-apply was considered and rejected as too indirect.

## Assumptions

- ✓ **confident** — `updateNotifUI` is already imported in `renderer/sidebar.js`.
  - _Basis (reproducer)_: `grep -n "updateNotifUI" renderer/sidebar.js` → `6:import { updateNotifUI } from './notifications.js';`

- ✓ **confident** — `has-busy` (green) and `has-notification` (blue) are the CSS classes that render the dots described in the issue.
  - _Basis (file:line)_: `styles.css:3252` — `.worktree-item.has-busy::after { background: #3fb950; animation: pulse-busy ... }` (green); `styles.css:3230` — `.worktree-item.has-notification::after { background: #4a9eff; }` (blue)

- ✓ **confident** — `loadProjects()` never calls `updateNotifUI()`, meaning the dots are never restored after a DOM rebuild.
  - _Basis (reproducer)_: `grep -n "updateNotifUI" renderer/sidebar.js` → only lines 6 (import) and 315 (inside expand-toggle click handler), neither of which is inside `loadProjects()`.

- ✓ **confident** — The `busyTabs` Set and `notifActivity` Map in `notifications.js` are module-level and survive `loadProjects()` DOM rebuilds; calling `updateNotifUI()` after the rebuild re-applies correct state.
  - _Basis (file:line)_: `renderer/notifications.js:7-15` — both are module-level `const` declarations.

- ✓ **confident** — The workaround (clicking a non-main worktree) works because `openWorkDir` → `switchTab` → `clearNotifForTab` → `updateNotifUI()`.
  - _Basis (file:line)_: `renderer/tabs.js:218` — `clearNotifForTab(id)` is called in `switchTab`; `renderer/notifications.js:108` — `updateNotifUI()` is called in `clearNotifForTab`.

- ✓ **confident** — Clicking "main" doesn't fix it because main typically has no open terminal tabs, so `switchTab` is never called.
  - _Basis (file:line)_: `renderer/app.js:112-133` — `openWorkDir` only calls `switchTab` when `tabsForWorkDir(workDir).length > 0`.

## Definition of done

- After Claude (or any process) creates a new git worktree, the green busy dot and blue notification dot on other worktree rows in the sidebar remain visible without requiring a user click.
- The `npm test`-equivalent (`node --test test/*.test.js test/*.test.mjs`) continues to pass.

## Up-front tests

None — the change is a single `updateNotifUI()` call in a DOM-manipulation function. Writing a unit test would require mocking the full Electron renderer DOM environment; the test would be performative rather than protective. (See Decisions for details.)

## Tasks

- [x] Call `updateNotifUI()` in `loadProjects()` after DOM rebuild and state restoration
  - _Story: As a user with a running Claude session, when Claude creates a new worktree and the sidebar reloads, then the green busy dot and blue notification dot on my worktree rows stay visible._
  - _test: manual — verify dots remain after sidebar reload_

## Verify

```bash
node --test test/*.test.js test/*.test.mjs
```

## Decisions

- **Test-first skipped**: the change is `updateNotifUI()` called in a DOM function inside an Electron renderer ESM module. The existing test suite uses `node --test` for Node.js/CommonJS main-process code; there is no test harness for renderer DOM behavior. Writing a unit test would require jsdom + ESM loader setup — that's more infrastructure than the fix itself and the test would be purely structural ("does this function get called"), not behavioral. Added the call alongside the change per the carve-out rule.

- **`npm test` vs direct invocation**: `npm test` (running `node --test test/`) fails pre-existing with `Cannot find module '/home/user/braska/test'` — Node interprets the directory as a module entry. The Verify block uses the explicit-glob invocation which passes.

## Don'ts (rejected approaches and disproved assumptions)

_None yet._

## Course corrections

_None yet._

## Subagent notes

Research subagent found the same root cause: `loadProjects()` calls `renderProjects()` (destroys DOM) then `refreshWorktreeMetrics()` without calling `updateNotifUI()`. Also noted that `refreshWorktreeMetrics()` lacks an `await` which is a separate minor issue in the modal flow — not fixed in this PR to stay in scope.

## Follow-ups (deferred work)

- Consider adding `await refreshWorktreeMetrics()` in `loadProjects()` to prevent a race in the modal-initiated worktree creation flow (when `_openWorkDir(wtPath)` is called immediately after `await _loadProjects()`).

## Open questions

_None._

## Baseline verify (pre-implementation)

See [baseline-verify.md](./baseline-verify.md) — 101 tests pass, 0 fail.

## Verification results (post-implementation)

See [verify-results.md](./verify-results.md) — 101 tests pass, 0 fail. No regressions.
