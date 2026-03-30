# Ticketmaster Writes Tickets to ~/.braska Instead of Project .braska

## Priority: High

## Description
The ticketmaster specialist was creating tickets in `~/.braska/tickets/` instead of the project's `.braska/tickets/`. This happened because specialists are spawned via a login shell (`-l` flag), and login shell profile scripts can change the working directory before Claude starts. The ticketmaster's instructions used relative paths (`.braska/tickets/`), so when the CWD shifted to `~`, tickets landed in the wrong location.

## Fix Applied
Two changes:

1. **main.js** — All Claude/specialist PTY spawns now prepend `cd '<workDir>' &&` before the `claude` command. This guarantees the correct working directory even if login shell profiles change it.

2. **ticketmaster claude.md** — Updated instructions to have the ticketmaster verify its working directory with `pwd` first and use absolute paths for ticket operations.

## Tasks
- [x] Add explicit `cd` to workDir before claude command in PTY spawn (main.js)
- [x] Update ticketmaster claude.md to verify CWD and use absolute paths
- [x] Verify no other specialists are affected (debugger and code-reviewer are fine)
