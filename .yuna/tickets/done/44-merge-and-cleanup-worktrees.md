# Merge & Clean Up Worktrees

## Priority: High

## Description
Add a one-click "Merge & Clean Up" action for git worktrees. When work on a feature branch is done, users should be able to merge the branch into main and clean up (remove worktree, delete branch, close tabs) in a single action from the right-click context menu — without needing to run manual git commands.

## Tasks
- Add `git:merge-preflight` IPC handler to check branch status (dirty state, commit count, already-merged)
- Add `git:merge-and-cleanup` IPC handler to merge, remove worktree, and delete branch
- Add preload bridge methods `mergePreflight` and `mergeAndCleanup`
- Add "Merge & Clean Up" item to worktree context menu (disabled for main worktree)
- Create merge modal with loading, ready, merging, and done/error states
- Show commit summary with scrollable list and branch arrow visualization
- Block merge when worktree has uncommitted changes
- Handle merge conflicts gracefully (auto-abort, no changes made)
- Handle already-merged branches with clean-up-only flow
- Handle partial success (merge ok but cleanup fails)
- Close all associated tabs after successful merge and cleanup
- Support force cleanup for locked worktrees
