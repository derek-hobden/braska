# Ticket 15: Visual Notifications

## Category
Feature — UX

## Status
Resolved

## Description

Add a visual notification system with two components:

1. **Worktree tab badges (sidebar)** — When activity occurs in a background worktree's terminal (e.g. a Claude expert finishes a task, a command completes, or output is waiting), show a notification indicator on that worktree's entry in the left sidebar so the user can see which worktree needs attention without switching to it.

2. **Central notification bell (top bar)** — Add a bell icon to the top toolbar that aggregates all notifications in one place. Clicking it should show a dropdown/panel listing recent notifications across all worktrees, allowing the user to jump directly to the relevant tab.

## Resolution

Implemented with three levels of blue dot indicators and a central bell:

- **Tab dots**: individual tabs get a blue dot when their background PTY output stops for 1s (debounced) or on process exit. Dot clears only when that specific tab is switched to.
- **Worktree dots**: worktree sidebar items show a dot if any child tab has an unseen notification. Persists until all child tabs are viewed.
- **Project dots**: project entries (including collapsed git projects) aggregate from all child worktrees. Visible even when the worktree accordion is collapsed.
- **Bell icon**: toolbar bell with unseen count badge. Dropdown lists recent notifications (tab label, project/branch, output snippet, relative timestamp). Click to jump to tab. "Clear all" resets. Closes on outside click or Escape.
- **Notification log**: capped at 50 entries, per-tab deduplication (updates snippet on existing unseen entry). UI updates debounced at 300ms.
- **Startup fix**: `activeTabId` set before `onData` registration to prevent false notifications from shell/Claude startup output.
