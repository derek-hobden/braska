# Draggable Tabs to Reorder

## Priority: Medium

## Description
Tabs within a work tree should be draggable so users can reorder them by dragging and dropping. Currently, tabs are fixed in the order they were opened, with no way to rearrange them.

## Tasks
- Add drag-and-drop event handlers (dragstart, dragover, dragend, drop) to tab elements
- Provide visual feedback during drag (e.g. highlight drop target, show insertion indicator)
- Update the underlying tab order in state when a tab is dropped in a new position
- Ensure the active tab selection is preserved after reordering
