# Manual Way to Close Tickets

## Priority: Medium

## Description
There is currently no manual way to close tickets. Users need the ability to move tickets from open to closed status, either through the UI or via a command/action. This should move the ticket file from `.the-agency/tickets/open/` to `.the-agency/tickets/closed/`.

## Tasks
- Add a close action/button to the ticket view in the UI
- Implement file move from `tickets/open/` to `tickets/closed/` when a ticket is closed
- Confirm the closed ticket appears in the closed tickets list after moving
