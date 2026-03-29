# Cmd+T New Tab Picker with Number Hotkeys

## Priority: Medium

## Description
Add keyboard shortcuts for quickly creating new tabs. Pressing Command+T should open the tab type picker modal, and then pressing 1, 2, 3, or 4 should select the corresponding option (Expert, Terminal, Browser, Ticketmaster). Escape should dismiss the picker.

Implementation notes:
- Intercept Cmd+T in the main process `before-input-event` handler (same pattern as Cmd+W) and send an IPC message `open-tab-picker` to the renderer
- Add `onOpenTabPicker` to the `windowActions` bridge in `preload.js`
- In the renderer, listen for the event and call `showTabTypePicker(activeWorkDir)`
- Add a `keydown` listener that, while the picker is active, maps keys 1-4 to clicking the corresponding `.tab-type-picker-item` (use a `data-hotkey` attribute on each item)
- Show a subtle key hint badge on each picker item (e.g. a small `<span class="tab-type-picker-hint">` styled to the right)
- Escape should close the picker

NOTE: The code changes that were started for this ticket need to be reverted first — `main.js`, `preload.js`, and `index.html` were modified prematurely and should be reset before a clean implementation.

## Tasks
- Revert premature changes to main.js, preload.js, and index.html
- Intercept Cmd+T in main process before-input-event and send IPC to renderer
- Add onOpenTabPicker bridge in preload.js
- Add keydown listener in renderer for 1-4 and Escape while picker is open
- Add hotkey hint badges to picker items
- Test Cmd+T opens picker and number keys select correctly
