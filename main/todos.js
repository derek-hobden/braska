const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathExists, resolveInDir, execFileAsync, fsp } = require('./utils');
const { getActiveTodosWatcher, setActiveTodosWatcher } = require('./state');

async function getTodosDir(workDir) {
  try {
    // Use git-common-dir so all worktrees of the same repo share one todos directory
    const { stdout } = await execFileAsync('git', ['rev-parse', '--git-common-dir'], { cwd: workDir, encoding: 'utf-8', timeout: 5000 });
    const commonDir = stdout.trim();
    // commonDir may be relative (e.g. '.git') in the main worktree, or absolute in a linked worktree
    const absCommonDir = path.resolve(workDir, commonDir);
    const repoRoot = path.dirname(absCommonDir);
    const projectName = path.basename(repoRoot);
    return path.join(os.homedir(), '.braska', 'projects', projectName, 'todos');
  } catch {
    // Not a git repo: fall back to workDir basename
    return path.join(os.homedir(), '.braska', 'projects', path.basename(workDir), 'todos');
  }
}

async function migrateTodosIfNeeded(workDir, todosDir) {
  const oldTicketsDir = path.join(workDir, '.braska', 'tickets');
  if (!await pathExists(oldTicketsDir)) return;
  for (const status of ['open', 'done', 'cancelled']) {
    const oldSubdir = path.join(oldTicketsDir, status);
    if (!await pathExists(oldSubdir)) continue;
    const newSubdir = path.join(todosDir, status);
    let files;
    try { files = await fsp.readdir(oldSubdir); } catch { continue; }
    for (const f of files) {
      if (!f.endsWith('.md')) continue;
      const dest = path.join(newSubdir, f);
      if (!await pathExists(dest)) {
        try { await fsp.rename(path.join(oldSubdir, f), dest); } catch {}
      }
    }
  }
}

async function ensureTodosDirs(workDir) {
  const dir = await getTodosDir(workDir);
  await fsp.mkdir(path.join(dir, 'open'), { recursive: true });
  await fsp.mkdir(path.join(dir, 'done'), { recursive: true });
  await fsp.mkdir(path.join(dir, 'cancelled'), { recursive: true });
  await migrateTodosIfNeeded(workDir, dir);
  return dir;
}

async function listTodos(workDir) {
  const dir = await getTodosDir(workDir);
  const results = [];
  for (const status of ['open', 'done', 'cancelled']) {
    const subdir = path.join(dir, status);
    try {
      for (const f of await fsp.readdir(subdir)) {
        if (!f.endsWith('.md')) continue;
        const filePath = path.join(subdir, f);
        const content = await fsp.readFile(filePath, 'utf-8');
        const titleMatch = content.match(/^# (.+)$/m);
        const prioMatch = content.match(/^## Priority:\s*(.+)$/m);
        const ghIssueMatch = content.match(/^## GitHub Issue:\s*#?(\d+)/m);
        results.push({
          filename: f,
          title: titleMatch ? titleMatch[1].trim() : f.replace(/\.md$/, ''),
          priority: prioMatch ? prioMatch[1].trim() : null,
          githubIssue: ghIssueMatch ? parseInt(ghIssueMatch[1]) : null,
          status,
          path: path.join(status, f),         // relative to todos root: "open/01-foo.md"
          absolutePath: filePath,              // absolute path for initial prompts
        });
      }
    } catch {}
  }
  results.sort((a, b) => {
    const na = parseInt(a.filename) || 0;
    const nb = parseInt(b.filename) || 0;
    return nb - na;
  });
  return results;
}

function register({ ipcMain, BrowserWindow }) {
  ipcMain.handle('todos:init', (_event, workDir) => ensureTodosDirs(workDir));
  ipcMain.handle('todos:list', (_event, workDir) => listTodos(workDir));
  ipcMain.handle('todos:read', async (_event, workDir, relPath) => {
    const todosDir = await getTodosDir(workDir);
    try { return await fsp.readFile(resolveInDir(todosDir, relPath), 'utf-8'); }
    catch { return ''; }
  });
  ipcMain.handle('todos:close', async (_event, workDir, relPath, status) => {
    if (!['done', 'cancelled'].includes(status)) throw new Error('Invalid status');
    const todosDir = await getTodosDir(workDir);
    const filePath = resolveInDir(todosDir, relPath);
    const targetDir = path.join(todosDir, status);
    await fsp.mkdir(targetDir, { recursive: true });
    const dest = path.join(targetDir, path.basename(filePath));
    await fsp.rename(filePath, dest);
  });

  ipcMain.on('todos:watch', async (event, workDir) => {
    const prev = getActiveTodosWatcher();
    if (prev) { prev.close(); setActiveTodosWatcher(null); }
    if (!workDir) return;
    try {
      const todosDir = await getTodosDir(workDir);
      await fsp.mkdir(todosDir, { recursive: true });
      const win = BrowserWindow.fromWebContents(event.sender);
      const watcher = fs.watch(todosDir, { recursive: true }, () => {
        if (!win?.isDestroyed()) win.webContents.send('todos:changed');
      });
      watcher.on('error', () => {});
      setActiveTodosWatcher(watcher);
    } catch {}
  });

  ipcMain.on('todos:unwatch', () => {
    const prev = getActiveTodosWatcher();
    if (prev) { prev.close(); setActiveTodosWatcher(null); }
  });
}

module.exports = { register, getTodosDir, ensureTodosDirs };
