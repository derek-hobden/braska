# Sidebar collapse broken

## Priority: High

## Description
The left sidebar no longer collapses when clicking the hide/toggle sidebar button (⌘B). The sidebar remains visible at its current width.

The root cause is that the resizable panels code (`initResizablePanels` in `index.html`) sets inline `style.width` and `style.minWidth` on the `#sidebar` element from localStorage. These inline styles have higher CSS specificity than the `#sidebar.collapsed` class rules (`width: 0; min-width: 0;`), so the collapsed class has no visible effect.

## Tasks
- Update `toggleSidebar()` to clear inline `width` and `minWidth` styles when collapsing
- Restore saved width from localStorage when expanding
- Verify collapse/expand works after resizing the sidebar
