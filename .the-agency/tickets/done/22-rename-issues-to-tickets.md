# Rename Issue System to Tickets

## Priority: Medium

## Description
Rename the entire issue system to use "Tickets" terminology. The Issue Creator expert should become the "Ticketmaster" expert.

## Tasks
- Rename `.the-agency/experts/issue-creator/` directory to `.the-agency/experts/ticketmaster/`
- Update the expert's `CLAUDE.md` to replace all "Issue Creator" references with "Ticketmaster" and "issues" with "tickets"
- Rename `.the-agency/issues/` directory to `.the-agency/tickets/` (preserving `open/` and `closed/` subdirectories)
- Update all file references within the CLAUDE.md (e.g. `.the-agency/issues/open/` → `.the-agency/tickets/open/`)
- Update file naming format description (e.g. "issue file" → "ticket file")
- Verify all existing ticket files are intact after the rename
