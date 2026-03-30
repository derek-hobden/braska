# Left Panel Breaks After Certain Navigation Actions

## Priority: High

## Description
The left panel breaks under multiple scenarios, losing accordion expand/collapse functionality and git icons. The panel becomes non-functional with no way to navigate back into a worktree.

**Known triggers:**
1. **Removing a project via X icon** — Using the X icon on the left panel to remove a project corrupts the panel's UI state rather than cleanly updating it.
2. **Navigating to Settings and back** — Going to the settings view and then returning to the main view causes the same breakage: the accordion and all left menu functionality stops working.

This points to a shared root cause where certain navigation or view transitions corrupt the left panel's state/DOM rather than properly preserving or re-initializing it.

## Tasks
- Reproduce the bug via both triggers (removing a project, and navigating to settings and back)
- Identify what state or DOM changes occur during these actions that break the accordion and git icons
- Determine the shared root cause (likely the panel is rebuilt or its event listeners are lost during view transitions)
- Fix the rendering/state logic so the left panel retains full functionality after any navigation action
- Ensure the user can still navigate into worktrees after a project is removed
- Test removing projects in various positions (first, middle, last, only project)
- Test navigating to settings and back with various panel states (expanded, collapsed, multiple projects)
