# Commit message persists when switching worktrees

## Priority: Low

## Description
When a user has typed a commit message in the commit message box and then switches to a different worktree, the commit message text remains in the input. Each worktree should have its own independent commit message state, since commits are scoped to a specific worktree.

## Tasks
- Store commit message state per worktree rather than globally
- Clear or restore the appropriate commit message when switching worktrees
- Verify that switching back to the original worktree restores its commit message
