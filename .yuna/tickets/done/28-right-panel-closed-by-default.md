# Right Panel Should Be Closed by Default When No Project/Worktree Is Selected

## Priority: Medium

## Description
When the application opens, the right panel should be closed by default because no project or worktree is selected yet. With nothing selected, there is nothing meaningful to display in the Explorer, Changes, or Tickets tabs, so showing an empty panel wastes screen space.

As soon as the user selects a project or worktree, the right panel should automatically open to reveal the relevant content.

## Tasks
- Default the right panel to closed on application startup
- Detect when a project or worktree is selected and automatically open the right panel
- Ensure the panel stays open once opened (until manually closed by the user)
