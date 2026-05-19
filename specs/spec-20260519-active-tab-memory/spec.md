# Spec — active tab memory (#42)

Issue: [#42](https://github.com/derek-hobden/braska/issues/42) · PR: [#43](https://github.com/derek-hobden/braska/pull/43) · branch: `claude/issue-42` · started: 2026-05-19T13:30:00Z

**Status:** Spec drafted; implementation not started.

## Issue body

> when i switch away from a project and thengo back to it, braska forgets what tab i was on and just makes the one at the end active

## Chosen approach

Add `activeTabByWorkDir: new Map()` to `tabState` in `renderer/state.js`, write to it in `switchTab` after setting `activeTabId`, and read from it in `openWorkDir` to restore the previously-active tab when returning to a worktree. This is the smallest correct fix: it mirrors the existing `tabState.tabOrder` pattern (already a `Map` keyed by `workDir`), touches only two files, requires no IPC and no persistence changes, and fixes the in-session memory loss the issue describes. The remembered ID is validated (`tabState.tabs.has(id)`) before use, so a closed tab degrades gracefully to the last-tab fallback.

## Assumptions

- ✓ **confident** — In-session memory is sufficient: the issue doesn't mention app restarts, only switching away and back within a session. Tab IDs are ephemeral runtime UUIDs so persistence across restarts would require additional work not requested here.
- ✓ **confident** — `switchTab` is the single write-path for activating a tab: all activation goes through this function, so writing `activeTabByWorkDir` there is complete.
- ✓ **confident** — `openWorkDir` lines 119–123 is the only place that picks which tab to show on return: the condition `tabState.tabs.get(tabState.activeTabId)?.workDir !== workDir` is the bug site.

## Definition of done

- Switching from worktree A (with tab T active) to worktree B and back to worktree A shows tab T active, not the last tab in the list.
- Opening a worktree for the first time (no remembered tab) still shows the last tab as before.
- Closing the remembered tab and switching back falls through gracefully to the last-tab fallback.
- `npm test` passes with no new failures.

## Up-front tests

TDD carve-out applies to this fix. The renderer state changes are 3 lines that interact with `switchTab`'s DOM manipulation (`tab.pane.classList.toggle`, `window.browserView`, xterm fit) and `openWorkDir`'s DOM queries. Extracting them into a testable pure function would add abstraction that serves only the test, violating YAGNI. No new test file; manual verification covers the golden path.

## Tasks

Statuses: `- [ ]` pending, `- [x]` done, `- [ ] ~~text~~ — deferred: <reason>` deferred.

- [ ] **▶ Active** — Add `activeTabByWorkDir` field to `tabState` in `renderer/state.js`
  - _Story: As the renderer, when `tabState` is initialised, there is a Map available to store the last-active tab per worktree._
- [ ] Write `activeTabByWorkDir` in `switchTab` (`renderer/tabs.js`)
  - _Story: As the app, when I switch to tab T in worktree W, `tabState.activeTabByWorkDir.get(W)` returns T's id._
- [ ] Read `activeTabByWorkDir` in `openWorkDir` (`renderer/app.js`)
  - _Story: As a user, when I switch back to worktree W, the tab I was on before is re-selected; if it was closed, the last tab shows instead._

## Verify

Every command must exit 0 on success and non-zero on failure.

```bash
npm test
node -e "
const { tabState } = await import('./renderer/state.js');
const assert = (c, m) => { if (!c) throw new Error(m); };
assert(tabState.activeTabByWorkDir instanceof Map, 'activeTabByWorkDir must be a Map');
assert(tabState.activeTabByWorkDir.size === 0, 'must start empty');
console.log('state check: OK');
" --input-type=module
```

## Decisions

_Appended chronologically as implementation reveals choices._

## Don'ts (rejected approaches)

_What was tried and discarded, with the reason._

## Course corrections

_When the spec was wrong and how it was updated, with timestamp._

## Subagent notes

Research subagent (2026-05-19): confirmed `tabState.activeTabId` is the only cross-worktree active-tab field; `tabState.tabOrder` (a `Map` keyed by `workDir`) is the direct precedent for the fix; `switchTab` at `renderer/tabs.js:213` and `openWorkDir` at `renderer/app.js:94` are the two call sites.

## Follow-ups (deferred work)

_Tasks marked deferred during implementation, with reasons._

## Open questions

_Things that need human input before merge._

## Baseline verify (pre-implementation)

_Populated at end of Phase 2._

## Verification results (post-implementation)

_Populated in Phase 4._
