# Move Project Tracking to ~/.the-agency

## Priority: Medium

## Description
Currently, project tracking data (tickets, experts, configuration) lives inside each project's `.the-agency/` directory. This couples project management state to the repository working tree, which causes issues with worktrees and clutters the repo with non-source files.

Move project tracking to `~/.the-agency/` so that:
- Tracking data is centralized and accessible across worktrees
- The repository stays clean of non-source management files
- Multiple projects can be managed from a single location

## Tasks
- Design the new directory structure under `~/.the-agency/` (per-project namespacing, tickets, experts, config)
- Migrate ticket storage from `.the-agency/tickets/` to `~/.the-agency/<project>/tickets/`
- Update all file paths in the app that reference `.the-agency/` to use the home directory location
- Update expert configurations and CLAUDE.md references
- Add a migration path or script for existing projects
- Ensure worktrees share the same project tracking data
