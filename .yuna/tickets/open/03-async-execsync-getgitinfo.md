# Replace synchronous execSync in getGitInfo()

## Priority: High

## Description

`getGitInfo()` uses `execSync('git worktree list --porcelain', ...)` which is called from an `ipcMain.handle`. Every project listing synchronously blocks the main Electron process. With many projects or slow filesystems, this freezes the UI.

## Tasks

- Replace `execSync` with `execFile` (promise-based) or `child_process.spawn`
- Make `getGitInfo()` async
- Update all callers to await the result

## Impact

Prevents UI freezes when listing projects, especially with many projects or slow disk access.
