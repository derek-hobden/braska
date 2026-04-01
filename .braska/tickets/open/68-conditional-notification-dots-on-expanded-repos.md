# Conditional notification dots on expanded repos

## Priority: Low

## Description
In the left sidebar, when a project accordion is expanded and a worktree has a notification (blue dot or green busy dot), the dot currently appears on both the repo/project item and the worktree item. This is redundant — when the accordion is expanded, the worktree dots are already visible.

**Desired behavior:**
- When the project accordion is **expanded**: only show the notification dot on the worktree item, NOT on the project item
- When the project accordion is **collapsed**: show the notification dot on the project item (aggregated from child worktrees, as it works today)

This applies to both blue notification dots (`has-notification`) and green busy dots (`has-busy`).

## Tasks
- In `updateNotifUI()` (~line 3510 in `index.html`), check whether the `.project-entry` has the `expanded` class before applying `has-busy`/`has-notification` to its `.project-item`
- When expanded, skip setting dots on the project item (worktree dots are sufficient)
- When collapsed, keep the current aggregation logic so the project item shows a dot if any child worktree has activity
- Call `updateNotifUI()` when accordion expand/collapse is toggled (~line 2656) so dots update immediately on expand/collapse
