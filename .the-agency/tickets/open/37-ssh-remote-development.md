# SSH Remote Development

## Priority: High

## Description
Add the ability to connect The Agency to a remote machine over SSH so the user can work on remote codebases as if they were local. This is critical for working while traveling with poor internet (e.g. South Africa) by connecting back to a home Mac Mini.

The model to follow is VS Code Remote SSH: the UI runs locally on the laptop, but all file operations, terminal/PTY sessions, git commands, and Claude/expert sessions execute on the remote machine. This keeps the experience fast and responsive even on slow connections since only UI data travels over the wire, not the full codebase.

### Architecture

**Remote host requirements:**
- SSH server running (standard on macOS/Linux)
- Node.js installed
- A small "agency-remote" server process that gets deployed/started automatically on first connection
- The agency-remote server handles: file operations, PTY spawning, git commands, file watching

**Local app (the laptop):**
- All existing IPC handlers (file:read, file:save, filetree:list, pty:spawn, git:*, etc.) need a "remote" mode that forwards requests over SSH to the agency-remote server instead of executing locally
- The UI remains identical — the user shouldn't notice a difference except a connection indicator

**Connection layer:**
- SSH tunnel (multiplexed) carrying a JSON-RPC or similar protocol between local app and remote server
- Could use SSH port forwarding to a local socket, or pipe stdio over an SSH session

### Connection Management
- Start with support for one remote host
- Configure via settings: hostname, user, SSH key path, remote working directory
- UI to add/edit/remove remote hosts
- Connection indicator in the sidebar showing local vs remote + connection quality

### Resilience (Critical)
The connection must handle poor/unstable internet gracefully:
- **Session persistence** — remote PTY sessions and Claude sessions must survive connection drops. When reconnecting, reattach to existing sessions (similar to tmux/mosh behavior)
- **Auto-reconnect** — detect disconnection and automatically retry with backoff
- **Buffered output** — if the connection drops while Claude is working, buffer output on the remote side and replay on reconnect so nothing is lost
- **Graceful degradation** — if the connection is slow, prioritize terminal data over file tree updates. Don't freeze the UI waiting for responses
- **Connection timeout feedback** — show clear UI feedback when the connection is struggling, not just a spinner

### Future enhancements (not in scope for v1)
- Multiple simultaneous remote hosts
- Remote host discovery (Bonjour/mDNS on local network)
- Mosh-style UDP for even better latency tolerance
- Sync/cache frequently accessed files locally for offline browsing

## Tasks
- Design the agency-remote server protocol (file ops, PTY, git, file watching)
- Build the agency-remote Node.js server
- Build SSH connection manager in the main process (spawn ssh, establish tunnel, health checks)
- Abstract all IPC handlers to support local vs remote execution
- Add auto-deploy of agency-remote to the remote host on first connection
- Implement session persistence — remote PTY sessions survive disconnects
- Implement auto-reconnect with exponential backoff
- Implement output buffering on the remote side for disconnect tolerance
- Add remote host configuration UI in settings
- Add connection status indicator in the sidebar
- Test on slow/unstable connections (throttled network)
- Test reconnection and session reattachment after drop
