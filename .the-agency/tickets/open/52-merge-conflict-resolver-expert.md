# Merge Conflict Resolver Expert & Worktree Merge Conflict Handling

## Priority: Medium

## Description
When a user right-clicks on a worktree and selects "Merge & Cleanup", if there are any merge conflicts, a new tab should open with a merge-conflict resolver expert. This expert is a system expert that needs to be created first, then integrated into the merge & cleanup flow.

### Part 1: Create Merge Conflict Resolver Expert
- Create a new system expert for resolving merge conflicts
- The expert should be able to display conflicting files and their diffs
- Provide a UI for choosing how to resolve each conflict (accept incoming, accept current, accept both, manual edit)
- The expert should guide the user through resolving all conflicts in the worktree

### Part 2: Integrate with Merge & Cleanup Flow
- When "Merge & Cleanup" is triggered on a worktree and conflicts are detected, instead of failing silently or showing an error, open a new tab with the merge-conflict resolver expert
- Pass the worktree context (branch, conflicting files) to the expert tab
- After all conflicts are resolved, allow the user to continue the merge & cleanup process from within the expert tab

## Tasks
- Create the merge-conflict resolver system expert definition
- Build the conflict resolution UI (file list, diff view, resolution controls)
- Detect merge conflicts during the "Merge & Cleanup" worktree action
- Open a new tab with the merge-conflict resolver expert when conflicts are found
- Pass worktree and conflict context to the expert tab
- Allow completing the merge & cleanup after conflicts are resolved
