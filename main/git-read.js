const { errMsg, execFileAsync } = require('./utils');
const { getGitInfo } = require('./projects');

// Detect the default branch name (main or master)
async function detectDefaultBranch(cwd) {
  const fast = { cwd, encoding: 'utf-8', timeout: 5000 };
  try {
    const { stdout } = await execFileAsync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], fast);
    const ref = stdout.trim().replace('refs/remotes/origin/', '');
    if (ref) return ref;
  } catch {
    try {
      await execFileAsync('git', ['rev-parse', '--verify', 'master'], fast);
      return 'master';
    } catch {}
  }
  return 'main';
}

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

      const parseNameStatus = (out) => {
        const t = out.trim();
        if (!t) return new Map();
        const map = new Map();
        for (const line of t.split('\n')) {
          const [statusCode, ...rest] = line.split('\t');
          // R100/C100 → just 'R'/'C'; M/D/A stay as-is
          const status = statusCode[0];
          const file = status === 'R' || status === 'C' ? rest[1] : rest[0];
          map.set(file, status);
        }
        return map;
      };

      const mergeStatus = (numstat, nameStatus) =>
        numstat.map(f => ({ ...f, status: nameStatus.get(f.file) || 'M' }));

      let unstaged = [], staged = [], untracked = [];
      try {
        const [num, ns] = await Promise.all([
          execFileAsync('git', ['diff', '--numstat'], opts),
          execFileAsync('git', ['diff', '--name-status'], opts),
        ]);
        unstaged = mergeStatus(parseNumstat(num.stdout), parseNameStatus(ns.stdout));
      } catch {}
      try {
        const [num, ns] = await Promise.all([
          execFileAsync('git', ['diff', '--cached', '--numstat'], opts),
          execFileAsync('git', ['diff', '--cached', '--name-status'], opts),
        ]);
        staged = mergeStatus(parseNumstat(num.stdout), parseNameStatus(ns.stdout));
      } catch {}
      try {
        const { stdout } = await execFileAsync('git', ['ls-files', '--others', '--exclude-standard'], opts);
        if (stdout.trim()) untracked = stdout.trim().split('\n');
      } catch {}

      // Current branch name
      let branch = null;
      try {
        const { stdout: branchOut } = await execFileAsync('git', ['symbolic-ref', '--short', 'HEAD'], opts);
        branch = branchOut.trim();
      } catch { /* detached HEAD */ }

      // Conflicted files (unmerged)
      let conflicted = [];
      try {
        const { stdout } = await execFileAsync('git', ['diff', '--name-only', '--diff-filter=U'], opts);
        if (stdout.trim()) conflicted = stdout.trim().split('\n');
      } catch {}

      // Divergence vs local main + push/pull sync vs origin
      let mainDivergence = null;
      let mainStale = null;
      // Stale-main check runs independently of current-branch state so it
      // works on detached HEAD too.
      try {
        const fast = { ...opts, timeout: 5000 };
        const defaultBranch = await detectDefaultBranch(workDir);
        const remoteMain = `origin/${defaultBranch}`;
        await execFileAsync('git', ['rev-parse', '--verify', remoteMain], fast);
        const { stdout } = await execFileAsync('git', ['rev-list', '--left-right', '--count', `${defaultBranch}...${remoteMain}`], fast);
        const [localAheadStr, originAheadStr] = stdout.trim().split('\t');
        mainStale = {
          originAhead: parseInt(originAheadStr, 10) || 0,
          localAhead: parseInt(localAheadStr, 10) || 0,
          branch: defaultBranch,
        };
      } catch {}
      try {
        const fast = { ...opts, timeout: 5000 };
        const currentBranch = branch;
        if (!currentBranch) throw new Error('detached');
        const defaultBranch = await detectDefaultBranch(workDir);
        if (currentBranch !== defaultBranch) {
          const { stdout } = await execFileAsync('git', ['rev-list', '--left-right', '--count', `${defaultBranch}...HEAD`], fast);
          const [behindStr, aheadStr] = stdout.trim().split('\t');
          mainDivergence = {
            ahead: parseInt(aheadStr, 10) || 0,
            behind: parseInt(behindStr, 10) || 0,
            branch: defaultBranch,
            pushAhead: 0,
            pushBehind: 0,
            hasUpstream: false,
          };
        }
        // Push/pull sync vs origin for current branch
        const remote = `origin/${currentBranch}`;
        try {
          await execFileAsync('git', ['rev-parse', '--verify', remote], fast);
          const { stdout } = await execFileAsync('git', ['rev-list', '--left-right', '--count', `${remote}...HEAD`], fast);
          const [behindStr, aheadStr] = stdout.trim().split('\t');
          if (!mainDivergence) mainDivergence = { ahead: 0, behind: 0, branch: defaultBranch, pushAhead: 0, pushBehind: 0, hasUpstream: false };
          mainDivergence.pushAhead = parseInt(aheadStr, 10) || 0;
          mainDivergence.pushBehind = parseInt(behindStr, 10) || 0;
          mainDivergence.hasUpstream = true;
        } catch {}
      } catch { /* non-critical */ }

      let hasRemote = false;
      try {
        const { stdout: remoteOut } = await execFileAsync('git', ['remote'], opts);
        hasRemote = remoteOut.trim().length > 0;
      } catch {}

      return { isGit: true, branch, unstaged, staged, untracked, conflicted, mainDivergence, mainStale, hasRemote };
    } catch {
      return { isGit: false, unstaged: [], staged: [], untracked: [] };
    }
  });

  ipcMain.handle('git:worktree-metrics', async (_event, projectPath) => {
    try {
      const info = await getGitInfo(projectPath);
      if (!info.isGit) return [];

      const defaultBranch = await detectDefaultBranch(projectPath);

      // Project-wide: is local default-branch behind origin/default-branch?
      let mainStale = null;
      try {
        const remoteMain = `origin/${defaultBranch}`;
        const optsRoot = { cwd: projectPath, encoding: 'utf-8', timeout: 5000 };
        await execFileAsync('git', ['rev-parse', '--verify', remoteMain], optsRoot);
        const { stdout } = await execFileAsync('git', ['rev-list', '--left-right', '--count', `${defaultBranch}...${remoteMain}`], optsRoot);
        const [localAheadStr, originAheadStr] = stdout.trim().split('\t');
        mainStale = {
          originAhead: parseInt(originAheadStr, 10) || 0,
          localAhead: parseInt(localAheadStr, 10) || 0,
          branch: defaultBranch,
        };
      } catch {}

      const results = await Promise.all(info.worktrees.map(async (wt) => {
        const m = { path: wt.path, changed: 0, untracked: 0, ahead: 0, behind: 0, pushAhead: 0, pushBehind: 0, mainStale, isMain: !!wt.isMain };
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
        if (wt.branch && wt.branch !== '(detached)') {
          // Ahead/behind vs local main (how much work is on this branch)
          if (wt.branch !== defaultBranch) {
            try {
              const { stdout } = await execFileAsync('git', ['rev-list', '--left-right', '--count', `${defaultBranch}...HEAD`], opts);
              const [behindStr, aheadStr] = stdout.trim().split('\t');
              m.ahead = parseInt(aheadStr, 10) || 0;
              m.behind = parseInt(behindStr, 10) || 0;
            } catch {}
          }
          // Ahead/behind vs origin (has this branch been pushed)
          try {
            const remote = `origin/${wt.branch}`;
            await execFileAsync('git', ['rev-parse', '--verify', remote], { ...opts, timeout: 5000 });
            const { stdout } = await execFileAsync('git', ['rev-list', '--left-right', '--count', `${remote}...HEAD`], opts);
            const [behindStr, aheadStr] = stdout.trim().split('\t');
            m.pushAhead = parseInt(aheadStr, 10) || 0;
            m.pushBehind = parseInt(behindStr, 10) || 0;
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
      const { stdout } = await execFileAsync('git', ['log', `--format=%H%x00%P%x00%s%x00%an%x00%ar`, `-${n}`], opts);
      const out = stdout.trim();
      if (!out) return [];
      return out.split('\n').map(line => {
        const [hash, parents, message, author, date] = line.split('\0');
        return { hash, parents: parents ? parents.split(' ') : [], message, author, date };
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
