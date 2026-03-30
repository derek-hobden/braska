# Centralise tickets to home directory

## Priority: High

## Description
The ticketing system currently stores tickets inside each project's `.braska/tickets/` directory. This means every git worktree gets its own independent copy of ticket state, causing tickets to diverge across worktrees. Tickets should be a per-repo concern, not per-worktree.

Move the entire ticketing system to `~/.braska/tickets/<repo-id>/` so there is one canonical ticket list per repository, regardless of how many worktrees exist.

## Tasks
- Decide on a repo identifier strategy (e.g. git remote URL hash, or absolute path of the repo root) so each repo maps to a unique directory under `~/.braska/tickets/`
- Update `getTicketsDir()` and `ensureTicketsDirs()` in `main.js` to resolve ticket paths under `~/.braska/tickets/<repo-id>/` instead of `path.join(workDir, '.braska', 'tickets')`
- Update `listTickets()` in `main.js` to read from the new centralised location
- Update the IPC handlers (`tickets:init`, `tickets:list`, `tickets:read`, `tickets:close`) to pass repo identity rather than workDir for path resolution
- Update `resolveInDir()` calls for ticket operations to use the new base directory
- Update the preload bridge and renderer calls (`window.tickets.*`) to pass repo identity context
- Update the Ticketmaster specialist CLAUDE.md to point at the new `~/.braska/tickets/` location
- Migrate existing per-project `.braska/tickets/` into the new centralised location (one-time migration logic)
- Remove or deprecate the per-project `.braska/tickets/` directory after migration
- Test that tickets are shared correctly across worktrees of the same repo
