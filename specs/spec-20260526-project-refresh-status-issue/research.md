# Research: Project refresh status issue (#82)

## Problem summary

When Claude creates a new git worktree from within a terminal session, the `git-watcher.js` detects the structural change and broadcasts `git:projects-changed`, which triggers `loadProjects()` in the renderer. `loadProjects()` calls `renderProjects()` which replaces the entire `projectList.innerHTML`, destroying the old `.worktree-item` DOM nodes. The new DOM nodes are not given the `has-busy` or `has-notification` CSS classes, so the green (busy/running agent) and blue (unseen notification) status dots disappear. They do not reappear until something else calls `updateNotifUI()` — which only happens when there is new PTY data or when the user clicks a worktree tab.

## Approaches considered

**Approach 1: Call `updateNotifUI()` in `loadProjects()` after DOM rebuild**
- Description: After `renderProjects()` rebuilds the DOM and state is restored, call `updateNotifUI()` to re-apply `has-busy`/`has-notification` classes to the new `.worktree-item` elements.
- Pros: One-line fix; directly addresses the root cause; `updateNotifUI` is already imported in `sidebar.js`.
- Cons: None identified.
- Precedent: `updateNotifUI` is already called from `sidebar.js` inside the `project-item` click handler's expand toggle.

**Approach 2: Debounced `updateNotifUI()` call in the PTY data handler**
- Description: Add a periodic/debounced `updateNotifUI()` call in `terminals.js` so any new PTY data would re-apply dot state.
- Pros: Would also fix the dots post-load.
- Cons: Too indirect; only triggers while Claude is still sending output; doesn't help if Claude is idle after creating the worktree.

**Approach 3: Listen for `git:projects-changed` in notifications.js and call `updateNotifUI()`**
- Description: Have `notifications.js` also react to the `git:projects-changed` event and re-apply state.
- Pros: Decoupled.
- Cons: Would require preload exposure or cross-module wiring that isn't present; more complex than approach 1; the right layer for this is the sidebar itself.

**Approach 4: Patch `renderProjects()` to preserve `has-busy`/`has-notification` on `.worktree-item` elements**
- Description: Before rebuilding innerHTML, snapshot the classes on each worktree path, then re-apply after.
- Pros: Keeps renderProjects self-contained.
- Cons: More code; fragile if notifActivity state and DOM state diverge; approach 1 uses the authoritative source of truth.

## Recommended approach

**Approach 1**: add a single `updateNotifUI()` call at the end of the DOM-restoration block in `loadProjects()`.

The `updateNotifUI()` function reads `busyTabs` (a Set) and `notifActivity` (a Map) to determine which worktrees are busy or have unseen notifications — those are module-level in `notifications.js` and are unaffected by the DOM rebuild. Re-calling `updateNotifUI()` after the DOM rebuild simply re-applies those states to the new elements.

## Verified tool behavior

**Claim:** `updateNotifUI()` is already imported in `renderer/sidebar.js`.

**Reproducer:**
```bash
grep -n "updateNotifUI" /home/user/braska/renderer/sidebar.js
```

**Observed output:**
```
6:import { updateNotifUI } from './notifications.js';
194:    if (entry.classList.contains('expanded')) refreshProjectBadges(entry.dataset.path);
```
(The import is on line 6; `updateNotifUI` is called on line 315 inside the project-item click expand handler — `updateNotifUI()` call is present but only fires on expand toggle, not on full DOM rebuild.)

**Verdict:** Claim holds. No new import needed.

---

**Claim:** The `has-busy` and `has-notification` CSS classes represent the blue and green status dots visible on worktree items.

**Reproducer:**
```bash
grep -n "has-busy\|has-notification" /home/user/braska/styles.css | head -20
```

**Observed output:**
```
3230:    .worktree-item.has-notification::after { ... background: #4a9eff; ... }  /* blue */
3252:    .worktree-item.has-busy::after { ... background: #3fb950; ... }          /* green */
```

**Verdict:** Claim holds. `has-notification` → 6px blue circle; `has-busy` → 6px green pulsing circle.

---

**Claim:** `loadProjects()` never calls `updateNotifUI()`.

**Reproducer:**
```bash
grep -n "updateNotifUI" /home/user/braska/renderer/sidebar.js
grep -n "updateNotifUI" /home/user/braska/renderer/app.js
```

**Observed output (sidebar.js):**
```
6:import { updateNotifUI } from './notifications.js';
315:        updateNotifUI();  // inside project-item expand click handler only
```

`loadProjects()` (lines 74–96) does not call `updateNotifUI()`.

**Observed output (app.js):**
`updateNotifUI` is not called or imported in `app.js`.

**Verdict:** Claim holds. `loadProjects()` never calls `updateNotifUI()`.

---

**Claim:** After `loadProjects()` rebuilds the DOM, the next `updateNotifUI()` call happens only when new PTY data arrives or a user clicks a tab.

**Reproducer:** trace `updateNotifUI()` call sites:
```bash
grep -rn "updateNotifUI\|scheduleNotifUpdate" /home/user/braska/renderer/
```

**Observed output:**
```
notifications.js:42:export function scheduleNotifUpdate() { ... setTimeout(updateNotifUI, 300) }
notifications.js:50:export function updateNotifUI() { ... }
notifications.js:108:  updateNotifUI();   // in clearNotifForTab
notifications.js:116:  scheduleNotifUpdate();  // in markTabBusy
notifications.js:127:  scheduleNotifUpdate();  // in clearTabBusy
sidebar.js:315:    updateNotifUI();   // in expand-toggle click
terminals.js:114:  markTabActivity(...)  // after PTY data debounce → scheduleNotifUpdate
tabs.js:218:  clearNotifForTab(id)  // in switchTab → updateNotifUI
```

`scheduleNotifUpdate()` is triggered by PTY data (terminals.js) or tab switch (tabs.js). Tab switch happens when `switchTab()` is called which happens when the user clicks on a worktree that has open tabs. That's exactly the observed workaround.

**Verdict:** Claim holds. No path from `loadProjects()` to `updateNotifUI()`.

---

**Claim:** The existing tests pass before any change.

**Reproducer:**
```bash
node --test test/*.test.js test/*.test.mjs 2>&1 | tail -8
```

**Observed output:**
```
# tests 101
# suites 14
# pass 101
# fail 0
# cancelled 0
# skipped 0
```

**Verdict:** Claim holds. 101 tests passing, 0 failing.

Note: `npm test` (which runs `node --test test/`) fails pre-existing with `Cannot find module '/home/user/braska/test'`. This is a pre-existing issue — Node treats the directory as a module entry point rather than a test glob when given a directory with no index.js. This is unrelated to this issue.

## Unknowns

- None that block the fix.
- It's possible that `refreshWorktreeMetrics()` also deserves `await` in `loadProjects()` to avoid a race between the modal calling `_loadProjects()` then `_openWorkDir()` before metrics are rendered — but this is a separate (and much more minor) issue, not the cause of the reported bug.

## Files inventory

- `renderer/sidebar.js:6` — imports `updateNotifUI`; `loadProjects()` at line 74 is where the fix goes.
- `renderer/sidebar.js:74-96` — `loadProjects()`: rebuilds DOM, restores visual state, calls `refreshWorktreeMetrics()` but NOT `updateNotifUI()`.
- `renderer/notifications.js:50-94` — `updateNotifUI()`: iterates `.worktree-item` elements and applies `has-busy`/`has-notification` classes using module-level `busyTabs` Set and `notifActivity` Map.
- `renderer/notifications.js:111-116` — `markTabBusy()`: adds to `busyTabs`, calls `scheduleNotifUpdate()`.
- `renderer/app.js:241-244` — `onProjectsChanged` handler: debounced `loadProjects()` call that fires when git worktree structure changes.
- `main/git-watcher.js:21-45` — watches `.git` directory and fires `git:projects-changed` on HEAD/worktrees changes.
- `styles.css:3230,3252` — `.has-notification` (blue) and `.has-busy` (green) pseudo-element CSS.
