# Ticket 16: Right Pane Open by Default with Minimum Width

## Category
UX — Layout

## Description

Two changes to the right panel (file explorer / git changes):

1. **Open by default** — The right pane should be visible when the app launches or when a worktree is selected, rather than requiring the user to manually toggle it open.

2. **Minimum width** — Enforce a sensible minimum width on the right pane so it cannot be collapsed or resized to an unusably narrow state. The minimum should be wide enough to display file names and git status badges without truncation in typical cases.
