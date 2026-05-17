// Diagnostics IPC — read-only counters for CPU/RAM investigation (gh issue #30).
// Exposed to renderer via window.diagnostics.snapshot().

const { ptyProcesses, getActiveWatcher, getActiveGitDirWatcher, getActiveTodoWatcher } = require('./state');
const { getWatcherCount: getGitProjectsWatcherCount } = require('./git-watcher');
const { getFetcherStateSize } = require('./git-fetcher');

function register({ ipcMain }) {
  ipcMain.handle('diagnostics:snapshot', () => {
    const mem = process.memoryUsage();
    return {
      ts: Date.now(),
      main: {
        memory: {
          rss: mem.rss,
          heapTotal: mem.heapTotal,
          heapUsed: mem.heapUsed,
          external: mem.external,
        },
        counts: {
          ptyProcesses: ptyProcesses.size,
          activeFiletreeWatcher: getActiveWatcher() ? 1 : 0,
          activeGitDirWatcher: getActiveGitDirWatcher() ? 1 : 0,
          activeTodoWatcher: getActiveTodoWatcher() ? 1 : 0,
          gitProjectsWatchers: getGitProjectsWatcherCount(),
          gitFetcherState: getFetcherStateSize(),
        },
      },
    };
  });
}

module.exports = { register };
