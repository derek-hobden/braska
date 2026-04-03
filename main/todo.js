const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathExists, resolveInDir, execFileAsync, fsp } = require('./utils');
const { getActiveTodoWatcher, setActiveTodoWatcher } = require('./state');

async function getTodoDir(workDir) {
  try {
    // Use git-common-dir so all worktrees of the same repo share one todo directory
    const { stdout } = await execFileAsync('git', ['rev-parse', '--git-common-dir'], { cwd: workDir, encoding: 'utf-8', timeout: 5000 });
    const commonDir = stdout.trim();
    // commonDir may be relative (e.g. '.git') in the main worktree, or absolute in a linked worktree
    const absCommonDir = path.resolve(workDir, commonDir);
    const repoRoot = path.dirname(absCommonDir);
    const projectName = path.basename(repoRoot);
    return path.join(os.homedir(), '.braska', 'projects', projectName, 'todo');
  } catch {
    // Not a git repo: fall back to workDir basename
    return path.join(os.homedir(), '.braska', 'projects', path.basename(workDir), 'todo');
  }
}

async function migrateTicketsIfNeeded(workDir, todoDir) {
  const oldTicketsDir = path.join(workDir, '.braska', 'tickets');
  if (!await pathExists(oldTicketsDir)) return;
  for (const status of ['open', 'done', 'cancelled']) {
    const oldSubdir = path.join(oldTicketsDir, status);
    if (!await pathExists(oldSubdir)) continue;
    const newSubdir = path.join(todoDir, status);
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

async function ensureTodoDirs(workDir) {
  const dir = await getTodoDir(workDir);
  await fsp.mkdir(path.join(dir, 'open'), { recursive: true });
  await fsp.mkdir(path.join(dir, 'done'), { recursive: true });
  await fsp.mkdir(path.join(dir, 'cancelled'), { recursive: true });
  // Migrate old "todos/" directory to "todo/" (file-by-file, skip duplicates)
  const oldDir = dir.replace(/\/todo$/, '/todos');
  if (oldDir !== dir && await pathExists(oldDir)) {
    for (const status of ['open', 'done', 'cancelled']) {
      const oldSubdir = path.join(oldDir, status);
      let files;
      try { files = await fsp.readdir(oldSubdir); } catch { continue; }
      for (const f of files) {
        if (!f.endsWith('.md')) continue;
        const dest = path.join(dir, status, f);
        if (!await pathExists(dest)) {
          try { await fsp.rename(path.join(oldSubdir, f), dest); } catch {}
        }
      }
    }
    try { await fsp.rm(oldDir, { recursive: true, force: true }); } catch {}
  }
  await migrateTicketsIfNeeded(workDir, dir);
  return dir;
}

async function listTodos(workDir) {
  const dir = await getTodoDir(workDir);
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
          path: path.join(status, f),         // relative to todo root: "open/01-foo.md"
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
  ipcMain.handle('todo:init', (_event, workDir) => ensureTodoDirs(workDir));
  ipcMain.handle('todo:list', (_event, workDir) => listTodos(workDir));
  ipcMain.handle('todo:read', async (_event, workDir, relPath) => {
    const todoDir = await getTodoDir(workDir);
    try { return await fsp.readFile(resolveInDir(todoDir, relPath), 'utf-8'); }
    catch { return ''; }
  });
  ipcMain.handle('todo:close', async (_event, workDir, relPath, status) => {
    if (!['done', 'cancelled'].includes(status)) throw new Error('Invalid status');
    const todoDir = await getTodoDir(workDir);
    const filePath = resolveInDir(todoDir, relPath);
    const targetDir = path.join(todoDir, status);
    await fsp.mkdir(targetDir, { recursive: true });
    const dest = path.join(targetDir, path.basename(filePath));
    await fsp.rename(filePath, dest);
  });

  ipcMain.on('todo:watch', async (event, workDir) => {
    const prev = getActiveTodoWatcher();
    if (prev) { prev.close(); setActiveTodoWatcher(null); }
    if (!workDir) return;
    try {
      const todoDir = await getTodoDir(workDir);
      await fsp.mkdir(todoDir, { recursive: true });
      const win = BrowserWindow.fromWebContents(event.sender);
      const watcher = fs.watch(todoDir, { recursive: true }, () => {
        if (!win?.isDestroyed()) win.webContents.send('todo:changed');
      });
      watcher.on('error', () => {});
      setActiveTodoWatcher(watcher);
    } catch {}
  });

  ipcMain.on('todo:unwatch', () => {
    const prev = getActiveTodoWatcher();
    if (prev) { prev.close(); setActiveTodoWatcher(null); }
  });
}

module.exports = { register, getTodoDir, ensureTodoDirs };
