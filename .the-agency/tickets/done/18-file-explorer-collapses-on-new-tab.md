# File explorer collapses when opening a new tab

**Status: FIXED (2026-03-29)**

## Problem

Opening a new tab causes the file explorer (right panel) to collapse. The explorer state should be preserved per worktree — navigating between tabs, closing tabs, and creating tabs within the same worktree should not affect whether the file explorer is open or closed.

## Root Cause

`startTask` and `startBrowser` called `refreshRightPanel(workDir)` unconditionally, which called `refreshFileTree` → `filetreeBody.innerHTML = ''` and rebuilt the tree from scratch, collapsing all expanded directories. Additionally, `filetreeVisible` was a single global boolean, so toggling the explorer in one worktree leaked to all others.

## Fix

1. `startTask` and `startBrowser` now only call `refreshRightPanel` when the workDir actually changes (i.e., not when adding a tab to the current worktree).
2. Added `workDirExplorerVisible` Map to persist explorer panel visibility per worktree.
3. Extracted `setFiletreeVisible(visible)` helper that saves state to the map.
4. Added `restoreExplorerState(workDir)` called at the top of `openWorkDir` to restore the panel to whatever state it was in for that worktree (defaults to visible).
