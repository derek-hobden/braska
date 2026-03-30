# Work on Ticket in New Worktree

## Priority: Medium

## Description
Add a "Work on this in a new worktree" button to the ticket detail view so users can create an isolated worktree for a ticket and immediately get an expert working on it there. Previously, the only option was "Work on this ticket..." which spawns the expert in the current worktree.

## Tasks
- Add green "Work on this in a new worktree" button to ticket detail view (between "Work on this ticket..." and "Close ticket")
- Only show button for open tickets in git projects
- Auto-generate branch name from ticket number + slugified title (e.g. `ticket-123-implement-dark-mode`)
- Auto-generate worktree path using existing `../<project>.worktrees/<branch>` convention
- Create worktree, refresh sidebar, select new worktree, chain into expert picker with ticket context
- Show loading state on button and inline error on failure
- Add `getProjectRootForWorkDir()` helper to resolve git root from any worktree via sidebar DOM
