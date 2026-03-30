# Move Tickets Outside the Repo

## Priority: Medium

## Description
Tickets currently live inside the repo at `.the-agency/tickets/`. This ties them to a specific worktree, which is problematic when working across multiple worktrees. Tickets should be stored alongside the repo directory rather than inside it.

**Current structure:**
```
../the-agency/                  # repo
../the-agency/.the-agency/tickets/  # tickets (inside repo)
../the-agency.worktrees/        # worktrees
```

**Option A — Sibling directory:**
```
../the-agency/                  # repo
../the-agency.tickets/          # tickets (alongside repo)
../the-agency.worktrees/        # worktrees
```
Follows the same sibling-directory convention already used by `.worktrees`, keeping repo-related data co-located but not tied to any single worktree.

**Option B — Centralized home directory:**
```
~/.the-agency/tickets/the-agency/   # tickets keyed by repo name
~/.the-agency/tickets/other-repo/   # scales to multiple repos
```
Centralizes all ticket data under the user's home directory. Survives repo moves/renames, works naturally across machines with dotfile syncing, and keeps the repo directory completely clean.

## Tasks
- Update ticket read/write paths to use `../<repo_name>.tickets/` instead of `.the-agency/tickets/`
- Migrate existing tickets from `.the-agency/tickets/` to the new location
- Update any references to ticket paths in the codebase (e.g., file watchers, UI paths)
- Update the Ticketmaster expert's CLAUDE.md to reflect the new ticket location
- Ensure the new path is auto-created if it doesn't exist
- Remove `.the-agency/tickets/` from the repo after migration
