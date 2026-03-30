# Command+W should close the current pane, not the whole app

**Status: Resolved (2026-03-29)**

## Problem

On macOS, pressing Command+W closes the entire application window instead of just the currently focused pane. This is unexpected behavior — users expect Command+W to close/hide the active pane, consistent with standard macOS tab/pane conventions.

## Expected Behavior

Command+W should close (or collapse) the currently active pane. The app window should remain open.

## Actual Behavior

Command+W closes the entire application window.

## Resolution

Intercepted Cmd+W via `before-input-event` on the BrowserWindow's webContents in main.js (fires before Electron's native menu accelerator). The handler prevents default and sends a `close-active-tab` IPC event to the renderer, which calls `closeTab(activeTabId)`. If no tab is active, the keystroke is ignored. Window close button and Cmd+Q still work normally.
