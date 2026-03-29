# Pull Latest Main into Worktree

## Priority: Medium

## Description
There needs to be a quick, easy, and intuitive way for users to pull the latest changes from the main branch into their current worktree. The workflow should be user-friendly and require minimal steps — ideally a single button or action that handles fetching and merging/rebasing from main without the user needing to run manual git commands.

## Tasks
- Design a simple UI action (e.g. button or menu item) for pulling latest main into the active worktree
- Implement fetch + merge/rebase from main into the worktree's current branch
- Handle common edge cases (merge conflicts, uncommitted changes, dirty working tree)
- Show clear feedback on success or failure (e.g. "Up to date", "Merged N commits", conflict notification)
- Ensure the action is easily discoverable and accessible from the worktree context
