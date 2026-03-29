# Fix memory leak in PTY callback Maps

## Priority: Medium

## Description

In `preload.js` (lines 43-45), `onData` and `onExit` register callbacks into Maps. `removeListeners` is only called on explicit tab close. If the PTY process exits on its own (e.g., when `claude` finishes), the exit callback fires but the Maps are never cleaned up. Over time with many sessions, callbacks and their closures accumulate.

## Tasks

- Clean up callback Maps when a PTY process exits naturally
- Ensure `removeListeners` is called in the `onExit` handler
- Consider using WeakRef or similar patterns to avoid holding stale references

## Impact

Prevents gradual memory growth during long-running app sessions with many terminal tabs opened and closed.
