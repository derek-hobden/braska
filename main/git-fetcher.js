// Background git fetch scheduler. Runs shortly after startup, on window focus,
// and every 5 minutes while a window is focused. Enforces a per-project 60s
// debounce so rapid triggers don't thrash. Broadcasts 'git:fetched' to the
// renderer after each successful fetch so stale-main indicators update.
// Never pulls — only updates remote-tracking refs.

const path = require('path');
const { execFileAsync, pathExists } = require('./utils');
const { loadProjects } = require('./projects');
const { watchProjects } = require('./git-watcher');

const DEBOUNCE_MS = 60 * 1000;
const INTERVAL_MS = 5 * 60 * 1000;
const STARTUP_DELAY_MS = 2000;

const state = new Map(); // projectPath -> { lastFetchAt, inFlight }

async function fetchProject(BrowserWindow, projectPath) {
  const s = state.get(projectPath) || { lastFetchAt: 0, inFlight: false };
  if (s.inFlight) return;
  if (Date.now() - s.lastFetchAt < DEBOUNCE_MS) return;
  if (!await pathExists(path.join(projectPath, '.git'))) return;
  s.inFlight = true;
  state.set(projectPath, s);
  try {
    await execFileAsync('git', ['fetch', '--all', '--prune'], {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 30000,
    });
    s.lastFetchAt = Date.now();
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('git:fetched', projectPath);
    }
  } catch (err) {
    // Offline / auth-missing — don't notify the user, but surface real bugs
    // (missing git, ENOENT, etc) to the dev console.
    if (err && err.code !== 'ENOENT' && !/could not resolve host|authentication|network/i.test(String(err.message || ''))) {
      console.warn('[Braska git-fetcher] fetch failed for', projectPath, err.message || err);
    }
  } finally {
    s.inFlight = false;
    state.set(projectPath, s);
  }
}

async function fetchAllKnownProjects(app, BrowserWindow) {
  try {
    const projects = await loadProjects(app);
    watchProjects(projects, BrowserWindow);
    for (const p of projects) fetchProject(BrowserWindow, p.path);
  } catch (err) {
    console.error('[Braska git-fetcher] fetchAllKnownProjects failed:', err);
  }
}

function register({ app, BrowserWindow }) {
  setTimeout(() => fetchAllKnownProjects(app, BrowserWindow), STARTUP_DELAY_MS);

  setInterval(() => {
    if (BrowserWindow.getFocusedWindow()) fetchAllKnownProjects(app, BrowserWindow);
  }, INTERVAL_MS);

  app.on('browser-window-focus', () => {
    fetchAllKnownProjects(app, BrowserWindow);
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('git:projects-changed');
    }
  });
}

module.exports = { register, fetchProject, fetchAllKnownProjects };
