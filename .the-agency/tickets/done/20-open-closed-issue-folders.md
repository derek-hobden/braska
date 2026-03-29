# Ticket tracker needs open and closed folders

**Status:** Closed (2026-03-29)

## Problem

All tickets live in a flat `tickets/` directory with no distinction between open and closed tickets. As tickets get resolved, the folder grows and it becomes hard to see what still needs attention.

## Expected Behavior

Tickets are organised into `tickets/open/` and `tickets/closed/` subdirectories. New tickets are created in `open/`. Closing a ticket moves its file to `closed/`. This makes it immediately clear which tickets are active.

## Resolution

Created `tickets/open/` and `tickets/closed/` directories. Moved all 19 existing tickets into `open/`. Resolved tickets are closed by moving their file from `open/` to `closed/`.
