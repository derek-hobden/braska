# Worktree from ticket fails when branch or path already exists

## Priority: Medium

## Description
Clicking "Work on this in a new worktree" on a ticket fails with `fatal: a branch named '...' already exists` if the branch was created by a previous failed attempt. Even after fixing the branch check, a second failure occurs if the worktree directory path also lingers from the prior attempt. The worktree is never created and nothing appears in the left panel.

## Tasks
- [x] Handle "already exists" error in `git:worktree-add` IPC handler by retrying without `-b` flag to use existing branch
- [x] Clean up leftover worktree directory via `git worktree remove --force` before retry
- [x] Verified fix covers both branch-exists and path-exists failure cases
