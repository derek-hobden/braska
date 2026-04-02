const { errMsg, execFileAsync } = require('./utils');
const { getGitInfo } = require('./projects');

function register({ ipcMain }) {
  ipcMain.handle('git:status', async (_event, workDir) => {
    try {
      const opts = { cwd: workDir, encoding: 'utf-8', timeout: 10000 };
      try { await execFileAsync('git', ['rev-parse', '--git-dir'], opts); }
      catch { return { isGit: false, unstaged: [], staged: [], untracked: [] }; }

      const parseNumstat = (out) => {
        const t = out.trim();
        if (!t) return [];
        return t.split('\n').map(line => {
          const [a, d, ...rest] = line.split('\t');
          return { file: rest.join('\t'), added: a === '-' ? 0 : +a, deleted: d === '-' ? 0 : +d };
        });
      };

      let unstaged = [], staged = [], untracked = [];
      try {
        const { stdout } = await execFileAsync('git', ['diff', '--no-renames', '--numstat'], opts);
        unstaged = parseNumstat(stdout);
      } catch {}
      try {
        const { stdout } = await execFileAsync('git', ['diff', '--cached', '--no-renames', '--numstat'], opts);
        staged = parseNumstat(stdout);
      } catch {}
      try {
        const { stdout } = await execFileAsync('git', ['ls-files', '--others', '--exclude-standard'], opts);
        if (stdout.trim()) untracked = stdout.trim().split('\n');
      } catch {}

      return { isGit: true, unstaged, staged, untracked };
    } catch {
      return { isGit: false, unstaged: [], staged: [], untracked: [] };
    }
  });

  ipcMain.handle('git:worktree-metrics', async (_event, projectPath) => {
    try {
      const info = await getGitInfo(projectPath);
      if (!info.isGit) return [];

      // Detect default branch name
      let defaultBranch = 'main';
      try {
        const { stdout } = await execFileAsync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], { cwd: projectPath, encoding: 'utf-8', timeout: 5000 });
        const ref = stdout.trim().replace('refs/remotes/origin/', '');
        if (ref) defaultBranch = ref;
      } catch {
        try {
          await execFileAsync('git', ['rev-parse', '--verify', 'master'], { cwd: projectPath, encoding: 'utf-8', timeout: 5000 });
          defaultBranch = 'master';
        } catch {}
      }

      const results = await Promise.all(info.worktrees.map(async (wt) => {
        const m = { path: wt.path, changed: 0, untracked: 0, ahead: 0, behind: 0 };
        const opts = { cwd: wt.path, encoding: 'utf-8', timeout: 10000 };
        try {
          const { stdout } = await execFileAsync('git', ['status', '--porcelain'], opts);
          if (stdout.trim()) {
            for (const line of stdout.trim().split('\n')) {
              if (line.startsWith('?? ')) m.untracked++;
              else m.changed++;
            }
          }
        } catch {}
        if (wt.branch && wt.branch !== defaultBranch && wt.branch !== '(detached)') {
          try {
            const { stdout } = await execFileAsync('git', ['rev-list', '--count', `${defaultBranch}..HEAD`], opts);
            m.ahead = parseInt(stdout.trim(), 10) || 0;
          } catch {}
          try {
            const { stdout } = await execFileAsync('git', ['rev-list', '--count', `HEAD..${defaultBranch}`], opts);
            m.behind = parseInt(stdout.trim(), 10) || 0;
          } catch {}
        }
        return m;
      }));

      return results;
    } catch {
      return [];
    }
  });

  ipcMain.handle('git:diff', async (_event, workDir, filePath, isStaged) => {
    try {
      const opts = { cwd: workDir, encoding: 'utf-8', timeout: 10000, maxBuffer: 10 * 1024 * 1024 };
      const args = isStaged ? ['diff', '--cached', '--', filePath] : ['diff', '--', filePath];
      const { stdout } = await execFileAsync('git', args, opts);
      return stdout;
    } catch { return ''; }
  });

  ipcMain.handle('git:log', async (_event, workDir, count) => {
    try {
      const opts = { cwd: workDir, encoding: 'utf-8', timeout: 10000 };
      const n = Math.min(Math.max(parseInt(count) || 20, 1), 100);
      const { stdout } = await execFileAsync('git', ['log', `--format=%H%x00%s%x00%an%x00%ar`, `-${n}`], opts);
      const out = stdout.trim();
      if (!out) return [];
      return out.split('\n').map(line => {
        const [hash, message, author, date] = line.split('\0');
        return { hash, message, author, date };
      });
    } catch { return []; }
  });

  ipcMain.handle('git:commit-files', async (_event, workDir, hash) => {
    try {
      if (!/^[0-9a-f]+$/i.test(hash)) return [];
      const opts = { cwd: workDir, encoding: 'utf-8', timeout: 10000 };
      const { stdout } = await execFileAsync('git', ['diff-tree', '--no-commit-id', '--numstat', '-r', hash], opts);
      const out = stdout.trim();
      if (!out) return [];
      return out.split('\n').map(line => {
        const [a, d, ...rest] = line.split('\t');
        return { file: rest.join('\t'), added: a === '-' ? 0 : +a, deleted: d === '-' ? 0 : +d };
      });
    } catch { return []; }
  });

  ipcMain.handle('git:diff-commit', async (_event, workDir, hash, filePath) => {
    if (!/^[0-9a-f]+$/i.test(hash)) return '';
    const opts = { cwd: workDir, encoding: 'utf-8', timeout: 10000, maxBuffer: 10 * 1024 * 1024 };
    try {
      const { stdout } = await execFileAsync('git', ['diff', `${hash}~1`, hash, '--', filePath], opts);
      return stdout;
    } catch {
      try {
        const { stdout } = await execFileAsync('git', ['show', hash, '--', filePath], opts);
        return stdout;
      }
      catch { return ''; }
    }
  });
}

module.exports = { register };
