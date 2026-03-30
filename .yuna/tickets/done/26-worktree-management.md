# Worktree Management

## Priority: Medium

## Description
Add the ability to easily manage Git worktrees from within The Agency. Users should be able to create, list, switch between, and delete worktrees without leaving the application. Worktrees allow working on multiple branches simultaneously in separate directories, which is especially useful when juggling multiple issues or features at once.

## Tasks
- Add UI for creating a new worktree (select branch or create new branch, choose directory)
- Add UI for listing existing worktrees with their associated branches and paths
- Add ability to switch the active context to a different worktree
- Add UI for deleting a worktree (with confirmation and cleanup)
- Handle edge cases (e.g. dirty worktree deletion, locked worktrees, pruning stale entries)
