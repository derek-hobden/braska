# Side panels should be resizable

## Problem

The sidebar (left) and explorer/changes panel (right) have fixed widths. Users cannot drag to resize them, making it difficult to accommodate varying content — long file names get truncated, or the panels take up too much space when not needed.

## Expected Behavior

Both side panels are resizable by dragging their inner edge. Each panel has a minimum width so it cannot be collapsed to an unusable size. The resize handle should provide a visible affordance on hover (e.g., cursor change to `col-resize`).

## Fix

Add a drag handle element between each side panel and the content area. On `mousedown`, track horizontal mouse movement and update the panel width accordingly, clamping to a minimum width (e.g., 180px for the sidebar, 180px for the right panel). Persist the user's chosen widths so they survive tab switches and app restarts.
