# Worktree Setup Script

## Priority: Medium

## Description
We need the ability to define a setup script that runs automatically whenever a new worktree is created. This would handle pre-requisites like `npm install`, dependency setup, build steps, or any other initialization needed for the worktree to be ready to use immediately after creation.

Currently, after creating a worktree, users must manually remember and run setup commands before they can start working. A configurable setup script would streamline this workflow.

## Tasks
- Define a convention for the setup script location (e.g. `.the-agency/worktree-setup.sh` or similar)
- Run the setup script automatically after worktree creation completes
- Ensure the script runs in the context of the new worktree directory
- Display script output to the user so they can see progress and any errors
- Handle missing setup script gracefully (no error if it doesn't exist)
