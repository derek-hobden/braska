// Per-project .git watcher. Watches each known project's .git dir recursively,
// filtering for HEAD or worktrees/ changes. Broadcasts 'git:projects-changed'
// so the renderer can reload the sidebar without waiting for a user action.

const fs = require('fs');
const path = require('path');

const DEBOUNCE_MS = 500;
let watchers = [];
let debounceTimer = null;

function broadcastProjectsChanged(BrowserWindow) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('git:projects-changed');
    }
  }, DEBOUNCE_MS);
}

function watchProjects(projects, BrowserWindow) {
  for (const w of watchers) { try { w.close(); } catch {} }
  watchers = [];

  for (const p of projects) {
    const gitDir = path.join(p.path, '.git');
    try {
      const w = fs.watch(gitDir, { recursive: true }, (_evt, filename) => {
        if (!filename) return;
        // HEAD = branch switch on main worktree.
        // worktrees/<name>/HEAD or worktrees/<name>/gitdir = worktree added/removed.
        // Deliberately excludes worktrees/<name>/index.lock and similar noise.
        const parts = filename.split(/[/\\]/);
        const isHeadChange = filename === 'HEAD';
        const isWorktreeStructure = parts.length === 3 && parts[0] === 'worktrees'
          && (parts[2] === 'HEAD' || parts[2] === 'gitdir');
        if (isHeadChange || isWorktreeStructure) {
          broadcastProjectsChanged(BrowserWindow);
        }
      });
      w.on('error', () => {});
      watchers.push(w);
    } catch {}
  }
}

module.exports = { watchProjects };
