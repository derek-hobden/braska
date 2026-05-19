## Problem summary

`tabState` holds a single `activeTabId` value across all worktrees. When the user switches away from worktree A to worktree B, `tabState.activeTabId` gets overwritten with B's active tab. When they switch back to A, the condition at `app.js:119` checks whether `tabState.activeTabId` belongs to the new `workDir` — it doesn't, so it falls through to `switchTab(existing[existing.length - 1][0])`, always landing on the last tab in the order rather than the one the user was on. There is no per-worktree "last active tab" stored anywhere in renderer or main-process state.

## Approaches considered

**1. Per-worktree active tab map in `tabState`**

Add `activeTabByWorkDir: new Map()` to `tabState` in `renderer/state.js`. When `switchTab` is called, write `tabState.activeTabByWorkDir.set(tab.workDir, id)` in addition to setting `activeTabId`. In `openWorkDir`, replace the fallback with a lookup: `const remembered = tabState.activeTabByWorkDir.get(workDir); switchTab(remembered ?? existing[existing.length - 1][0])`.

- Pros: minimal change (2 files, ~4 lines), no IPC, no persistence format, survives the session, consistent with existing `tabState` pattern.
- Cons: memory is lost on window reload / app restart (same as all other renderer tab state today).
- Precedent: `tabState.tabOrder` already does per-worktree keyed storage with a `Map` — exact same pattern.

**2. Per-worktree active tab stored in `appState` and persisted to `projects.json` via IPC**

On each `switchTab`, call an IPC handler (e.g. `state:set-active-tab`) that persists `{ workDir → activeTabId }` alongside `projects.json`. Restore on app launch.

- Pros: survives restarts (currently no tab state survives restart at all, so this could be valuable later).
- Cons: significant scope creep — requires new IPC channel, main-process handler, serialisation, and tab-id stability across restarts (tab IDs are runtime-ephemeral UUIDs). YAGNI: the issue only mentions in-session memory loss.
- Precedent: none in this codebase; projects.json is project-list only.

**3. Store remembered tab index (position) instead of ID**

Record the tab's position in `tabOrder` rather than its ID. On returning, activate the tab at that index.

- Pros: survives the edge case where a tab was closed while away and its ID is gone.
- Cons: index drift when tabs are reordered or closed — the remembered index may point to a different tab. More fragile than storing the ID, which is already validated via `tabState.tabs.has(id)`.
- Precedent: none.

**4. Track per-worktree active tab via a `WeakRef` / DOM attribute**

Store the active tab ID on a data attribute of the worktree DOM element in the sidebar.

- Pros: none of note.
- Cons: DOM is rebuilt on every `loadProjects()` call (sidebar re-render wipes all custom attributes), making this unreliable. Anti-pattern: state at the middle, not the boundary.
- Precedent: none.

## Recommended approach

**Approach 1** — per-worktree active tab map in `tabState`.

It is the smallest correct fix. It mirrors the existing `tabState.tabOrder` pattern (a `Map` keyed by `workDir`), requires changes to exactly two files (`renderer/state.js` and `renderer/app.js`), and fixes the in-session regression the issue describes without adding IPC, persistence, or serialization complexity. The remembered ID is validated before use (`tabState.tabs.has(id)`), so a closed tab degrades gracefully to the last-tab fallback.

Concrete changes:

1. `renderer/state.js` — add `activeTabByWorkDir: new Map()` to `tabState`.

2. `renderer/tabs.js` — in `switchTab`, after `tabState.activeTabId = id`, add:
   ```js
   const _tab = tabState.tabs.get(id);
   if (_tab) tabState.activeTabByWorkDir.set(_tab.workDir, id);
   ```

3. `renderer/app.js` — in `openWorkDir`, replace lines 119–123:
   ```js
   // before:
   if (!tabState.activeTabId || tabState.tabs.get(tabState.activeTabId)?.workDir !== workDir) {
     switchTab(existing[existing.length - 1][0]);
   } else {
     switchTab(tabState.activeTabId);
   }
   // after:
   const rememberedId = tabState.activeTabByWorkDir.get(workDir);
   const fallbackId = existing[existing.length - 1][0];
   switchTab((rememberedId && tabState.tabs.has(rememberedId)) ? rememberedId : fallbackId);
   ```

## Unknowns

- Whether the user also expects the active tab to be remembered across app restarts (not mentioned in issue #42). If so, Approach 2 becomes relevant, but requires stable tab IDs across sessions which are not currently designed for persistence.
- Whether `switchTab` is ever called with a tab that belongs to a different `workDir` than `tabState.activeWorkDir` (e.g. from notification click). If so, writing to `activeTabByWorkDir` on every `switchTab` call is still correct.
- Whether there are test cases in `test/` that exercise `openWorkDir` switching.

## Files inventory

- `renderer/state.js` — defines `tabState`; `activeTabByWorkDir` field goes here.
- `renderer/app.js` — contains `openWorkDir` where the fallback-to-last-tab logic lives (~lines 119–123); main call site to fix.
- `renderer/tabs.js` — contains `switchTab` where `activeTabId` is written; companion write to `activeTabByWorkDir` goes here.
- `renderer/sidebar.js` — calls `_openWorkDir` on worktree click; no changes needed.
- `main/state.js` — PTY and watcher state only; no changes needed.
