# Make --dangerously-skip-permissions configurable

## Priority: High

## Description

`--dangerously-skip-permissions` is hardcoded in `main.js` (lines 181, 185) with no toggle, confirmation dialog, or user consent. This flag bypasses all permission checks in Claude and should be an opt-in user setting, not a default.

## Tasks

- Add a per-project or global setting to enable/disable the flag
- Add a UI toggle or confirmation dialog
- Default to permissions enabled (safe mode)
- Update PTY spawn logic to conditionally include the flag

## Security Impact

Running with permissions bypassed by default is a significant security risk, especially since the app spawns shell processes that can modify the filesystem.
