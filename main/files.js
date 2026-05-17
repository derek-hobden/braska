const path = require('path');
const fs = require('fs');
const { resolveInDir, pathExists, fsp, resolveGitDir } = require('./utils');
const { getActiveWatcher, setActiveWatcher, getActiveGitDirWatcher, setActiveGitDirWatcher } = require('./state');

function register({ ipcMain, BrowserWindow, shell }) {
  ipcMain.handle('file:read', async (_event, workDir, relPath) => {
    return fsp.readFile(resolveInDir(workDir, relPath), 'utf-8');
  });

  ipcMain.handle('file:save', async (_event, workDir, relPath, content) => {
    await fsp.writeFile(resolveInDir(workDir, relPath), content, 'utf-8');
  });

  ipcMain.handle('filetree:list', async (_event, workDir, relDir) => {
    try {
      const absDir = resolveInDir(workDir, relDir || '');
      const entries = await fsp.readdir(absDir, { withFileTypes: true });
      return entries
        .map(e => ({
          name: e.name,
          path: path.relative(workDir, path.join(absDir, e.name)),
          isDirectory: e.isDirectory(),
        }))
        .sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
    } catch {
      return [];
    }
  });

  // Generation token — every filetree:watch call bumps it. The deferred git-dir
  // watcher created inside the resolveGitDir().then() block checks its captured
  // token against this on resolution; if a newer watch has landed, the deferred
  // watcher is closed immediately instead of being installed. Prevents a watcher
  // leak when the user rapidly switches worktrees. gh issue #30.
  let watchGen = 0;

  ipcMain.on('filetree:watch', (event, dirPath) => {
    const prev = getActiveWatcher();
    if (prev) { prev.close(); setActiveWatcher(null); }
    const prevGit = getActiveGitDirWatcher();
    if (prevGit) { prevGit.close(); setActiveGitDirWatcher(null); }
    const myGen = ++watchGen;
    if (!dirPath) return;
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      const watcher = fs.watch(dirPath, { recursive: true }, (_eventType, filename) => {
        if (!win?.isDestroyed()) win.webContents.send('filetree:changed', filename);
      });
      watcher.on('error', () => {});
      setActiveWatcher(watcher);

      // In worktrees, .git is a file pointing to the real git dir (e.g. main/.git/worktrees/<name>).
      // Index changes happen there, outside fs.watch's reach — watch it separately.
      resolveGitDir(dirPath).then(gitDir => {
        if (myGen !== watchGen) return; // stale — newer watch has superseded us
        if (!gitDir || gitDir === path.join(dirPath, '.git')) return;
        try {
          const gitWatcher = fs.watch(gitDir, { recursive: true }, () => {
            if (!win?.isDestroyed()) win.webContents.send('filetree:changed', '.git/index');
          });
          gitWatcher.on('error', () => {});
          setActiveGitDirWatcher(gitWatcher);
        } catch {}
      });
    } catch {}
  });

  ipcMain.on('filetree:unwatch', () => {
    ++watchGen; // invalidate any in-flight deferred git-dir watcher creation
    const prev = getActiveWatcher();
    if (prev) { prev.close(); setActiveWatcher(null); }
    const prevGit = getActiveGitDirWatcher();
    if (prevGit) { prevGit.close(); setActiveGitDirWatcher(null); }
  });

  // Enhanced file explorer operations
  ipcMain.handle('filetree:create-file', async (_event, workDir, relDir, name) => {
    try {
      const safeName = path.basename(name);
      const absPath = resolveInDir(workDir, path.join(relDir || '', safeName));
      await fsp.writeFile(absPath, '', 'utf-8');
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('filetree:create-dir', async (_event, workDir, relDir, name) => {
    try {
      const safeName = path.basename(name);
      const absPath = resolveInDir(workDir, path.join(relDir || '', safeName));
      await fsp.mkdir(absPath, { recursive: true });
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('filetree:rename', async (_event, workDir, relPath, newName) => {
    try {
      const safeName = path.basename(newName);
      const oldAbs = resolveInDir(workDir, relPath);
      const newRelPath = path.join(path.dirname(relPath), safeName);
      const newAbs = resolveInDir(workDir, newRelPath);
      await fsp.rename(oldAbs, newAbs);
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('filetree:delete', async (_event, workDir, relPath) => {
    try {
      const absPath = resolveInDir(workDir, relPath);
      await fsp.rm(absPath, { recursive: true, force: true });
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('filetree:reveal', async (_event, workDir, relPath) => {
    try { shell.showItemInFolder(resolveInDir(workDir, relPath)); } catch {}
  });

  ipcMain.handle('filetree:gitignore', async (_event, workDir, relPath) => {
    try {
      const gitignorePath = resolveInDir(workDir, '.gitignore');
      let content = '';
      try { content = await fsp.readFile(gitignorePath, 'utf-8'); } catch {}
      const lines = content.split('\n');
      if (!lines.some(l => l.trim() === relPath)) {
        content = content.trimEnd() + '\n' + relPath + '\n';
        await fsp.writeFile(gitignorePath, content, 'utf-8');
      }
      return { ok: true };
    } catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('filetree:copy-in', async (_event, workDir, targetRelDir, srcAbsPaths) => {
    const copied = [], errors = [];
    for (const srcAbs of srcAbsPaths) {
      try {
        const destAbs = resolveInDir(workDir, path.join(targetRelDir || '', path.basename(srcAbs)));
        const stat = await fsp.stat(srcAbs);
        if (stat.isDirectory()) {
          await fsp.cp(srcAbs, destAbs, { recursive: true });
        } else {
          await fsp.copyFile(srcAbs, destAbs);
        }
        copied.push(path.basename(srcAbs));
      } catch (e) {
        errors.push({ name: path.basename(srcAbs), error: e.message });
      }
    }
    return { ok: errors.length === 0, copied, errors };
  });
}

module.exports = { register };
