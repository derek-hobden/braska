const { pathExists, errMsg, execFileAsync } = require('./utils');
const { getGitInfo } = require('./projects');

function register({ ipcMain }) {
  ipcMain.handle('git:pull-latest-main', async (_event, workDir, options = {}) => {
    try {
      const { autoStash = false } = options;
      const opts = { cwd: workDir, encoding: 'utf-8', timeout: 30000 };
      let didStash = false;

      // Determine main branch name
      let mainBranch = 'main';
      try {
        const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], { ...opts, timeout: 5000 });
        const root = stdout.trim();
        const info = await getGitInfo(root);
        const mainWt = info.worktrees.find(w => w.isMain);
        if (mainWt && mainWt.branch && mainWt.branch !== '(detached)') {
          mainBranch = mainWt.branch;
        }
      } catch { /* use fallback */ }

      // Check current branch
      let currentBranch;
      try {
        const { stdout } = await execFileAsync('git', ['symbolic-ref', '--short', 'HEAD'], { ...opts, timeout: 5000 });
        currentBranch = stdout.trim();
      } catch {
        return { ok: false, error: 'Cannot determine current branch (detached HEAD?)' };
      }
      if (currentBranch === mainBranch) {
        return { ok: false, error: 'Already on the main branch. Use Pull instead.' };
      }

      // Check for uncommitted changes
      const { stdout: statusOut } = await execFileAsync('git', ['status', '--porcelain'], opts);
      const status = statusOut.trim();
      if (status) {
        const count = status.split('\n').length;
        if (!autoStash) {
          return { ok: false, isDirty: true, dirtyCount: count };
        }
        await execFileAsync('git', ['stash', 'push', '-u', '-m', 'WIP: before pulling main'], opts);
        didStash = true;
      }

      // Determine merge target: origin/main if remote exists, otherwise local main
      let hasRemote = false;
      try {
        const { stdout } = await execFileAsync('git', ['remote'], { ...opts, timeout: 5000 });
        hasRemote = stdout.trim().length > 0;
      } catch { /* no remotes */ }

      let mergeTarget;
      if (hasRemote) {
        await execFileAsync('git', ['fetch', 'origin'], opts);
        mergeTarget = `origin/${mainBranch}`;
      } else {
        mergeTarget = mainBranch;
      }

      // Check if already up to date
      try {
        await execFileAsync('git', ['merge-base', '--is-ancestor', mergeTarget, 'HEAD'], { ...opts, timeout: 10000 });
        if (didStash) {
          try { await execFileAsync('git', ['stash', 'pop'], opts); } catch { /* nothing to restore */ }
        }
        return { ok: true, alreadyUpToDate: true };
      } catch { /* not ancestor — there are changes to merge */ }

      // Merge main into current branch
      try {
        const { stdout: mergeOut, stderr: mergeErr } = await execFileAsync('git', ['merge', mergeTarget], opts);
        const out = (mergeOut + mergeErr).trim();
        // Merge succeeded — restore stash if we created one
        if (didStash) {
          try {
            await execFileAsync('git', ['stash', 'pop'], opts);
            return { ok: true, output: out, stashPopped: true };
          } catch (popErr) {
            const popMsg = (popErr.stderr || popErr.stdout || popErr.message || '').toString();
            if (popMsg.includes('CONFLICT') || popMsg.includes('could not apply')) {
              const { stdout: cfOut } = await execFileAsync('git', ['diff', '--name-only', '--diff-filter=U'], { ...opts, timeout: 5000 });
              const conflictedFiles = cfOut.trim().split('\n').filter(Boolean);
              return { ok: true, output: out, stashPopConflicts: true, conflictedFiles };
            }
            return { ok: true, output: out, stashPopError: popMsg.split('\n')[0] };
          }
        }
        return { ok: true, output: out };
      } catch (mergeErr) {
        const msg = (mergeErr.stderr || mergeErr.stdout || mergeErr.message || '').toString();
        if (msg.includes('CONFLICT') || msg.includes('Automatic merge failed')) {
          // Leave merge in progress — return conflicted file list so UI can guide resolution
          const { stdout: cfOut } = await execFileAsync('git', ['diff', '--name-only', '--diff-filter=U'], { ...opts, timeout: 5000 });
          const conflictedFiles = cfOut.trim().split('\n').filter(Boolean);
          return { ok: false, hasConflicts: true, conflictedFiles, autoStashed: didStash };
        }
        // Non-conflict error — restore stash if we created one
        if (didStash) {
          try { await execFileAsync('git', ['stash', 'pop'], opts); } catch { /* ignore */ }
        }
        return { ok: false, error: msg.split('\n')[0] };
      }
    } catch (err) {
      return { ok: false, error: errMsg(err) };
    }
  });

  ipcMain.handle('git:abort-merge', async (_event, workDir) => {
    try {
      await execFileAsync('git', ['merge', '--abort'], { cwd: workDir, encoding: 'utf-8', timeout: 10000 });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errMsg(err) };
    }
  });

  ipcMain.handle('git:restore-working-tree', async (_event, workDir) => {
    try {
      await execFileAsync('git', ['restore', '.'], { cwd: workDir, encoding: 'utf-8', timeout: 10000 });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errMsg(err) };
    }
  });

  // Available branches not checked out in any worktree
  ipcMain.handle('git:branches', async (_event, workDir) => {
    try {
      const { stdout } = await execFileAsync('git', ['branch', '--format=%(refname:short)'], { cwd: workDir, encoding: 'utf-8', timeout: 5000 });
      const out = stdout.trim();
      if (!out) return [];
      const allBranches = out.split('\n').filter(Boolean);
      const wtInfo = await getGitInfo(workDir);
      const checkedOut = new Set(wtInfo.worktrees.map(w => w.branch).filter(Boolean));
      return allBranches.filter(b => !checkedOut.has(b));
    } catch { return []; }
  });

  ipcMain.handle('git:worktree-add', async (_event, workDir, worktreePath, branch, createNew) => {
    try {
      const opts = { cwd: workDir, encoding: 'utf-8', timeout: 30000 };
      const addArgs = createNew
        ? ['worktree', 'add', '-b', branch, worktreePath]
        : ['worktree', 'add', worktreePath, branch];
      await execFileAsync('git', addArgs, opts);
      return { ok: true };
    } catch (err) {
      if (err.stderr && err.stderr.includes('already exists')) {
        try {
          if (await pathExists(worktreePath)) {
            await execFileAsync('git', ['worktree', 'remove', '--force', worktreePath], { cwd: workDir, encoding: 'utf-8', timeout: 60000 });
          }
          await execFileAsync('git', ['worktree', 'add', worktreePath, branch], { cwd: workDir, encoding: 'utf-8', timeout: 30000 });
          return { ok: true };
        } catch (retryErr) {
          return { ok: false, error: errMsg(retryErr) };
        }
      }
      return { ok: false, error: errMsg(err) };
    }
  });

  ipcMain.handle('git:worktree-remove', async (_event, workDir, worktreePath, force, deleteBranch) => {
    try {
      const opts = { cwd: workDir, encoding: 'utf-8', timeout: 60000 };

      // Resolve the branch for this worktree before removing it
      let wtBranch = null;
      if (deleteBranch) {
        const info = await getGitInfo(workDir);
        const wt = info.worktrees.find(w => w.path === worktreePath);
        if (wt && wt.branch && !wt.isMain) wtBranch = wt.branch;
      }

      const removeArgs = force
        ? ['worktree', 'remove', '--force', worktreePath]
        : ['worktree', 'remove', worktreePath];
      await execFileAsync('git', removeArgs, opts);

      // Delete the branch after worktree removal
      if (wtBranch) {
        try { await execFileAsync('git', ['branch', '-d', wtBranch], opts); }
        catch {
          try { await execFileAsync('git', ['branch', '-D', wtBranch], opts); } catch {}
        }
      }

      return { ok: true };
    } catch (err) {
      const msg = (err.stderr || err.message || '').toString();
      const isDirty = msg.includes('modified') || msg.includes('untracked') || msg.includes('changes');
      const isLocked = msg.includes('locked');
      return { ok: false, error: msg.split('\n')[0], isDirty, isLocked };
    }
  });

  ipcMain.handle('git:worktree-prune', async (_event, workDir) => {
    try {
      await execFileAsync('git', ['worktree', 'prune'], { cwd: workDir, encoding: 'utf-8', timeout: 10000 });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errMsg(err) };
    }
  });

  ipcMain.handle('git:worktree-lock', async (_event, workDir, worktreePath, unlock) => {
    try {
      const cmd = unlock ? 'unlock' : 'lock';
      await execFileAsync('git', ['worktree', cmd, worktreePath], { cwd: workDir, encoding: 'utf-8', timeout: 5000 });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errMsg(err) };
    }
  });

  ipcMain.handle('git:merge-preflight', async (_event, workDir, featureWorktreePath) => {
    try {
      const info = await getGitInfo(workDir);
      if (!info.isGit) return { ok: false, error: 'Not a git repository' };

      const featureWt = info.worktrees.find(w => w.path === featureWorktreePath);
      if (!featureWt) return { ok: false, error: 'Worktree not found' };
      if (featureWt.isMain) return { ok: false, error: 'Cannot merge the main worktree into itself' };
      if (featureWt.branch === '(detached)') return { ok: false, error: 'Cannot merge a detached HEAD' };

      const mainWt = info.worktrees.find(w => w.isMain);
      if (!mainWt) return { ok: false, error: 'Main worktree not found' };

      const featureBranch = featureWt.branch;
      const targetBranch = mainWt.branch;
      const opts = { encoding: 'utf-8', timeout: 10000 };

      // Check for uncommitted changes in feature worktree
      let isDirty = false, dirtyFileCount = 0;
      try {
        const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { ...opts, cwd: featureWorktreePath });
        if (stdout.trim()) {
          isDirty = true;
          dirtyFileCount = stdout.trim().split('\n').length;
        }
      } catch { /* ignore */ }

      // Get commits that would be merged
      let commits = [], commitCount = 0;
      try {
        const { stdout } = await execFileAsync('git', ['log', '--oneline', `${targetBranch}..${featureBranch}`], { ...opts, cwd: workDir });
        const log = stdout.trim();
        if (log) {
          commits = log.split('\n').slice(0, 20).map(line => {
            const sp = line.indexOf(' ');
            return { hash: line.slice(0, sp), message: line.slice(sp + 1) };
          });
          commitCount = log.split('\n').length;
        }
      } catch { /* branches may have diverged, that's ok */ }

      // Check if already merged
      let alreadyMerged = false;
      try {
        await execFileAsync('git', ['merge-base', '--is-ancestor', featureBranch, targetBranch], { ...opts, cwd: workDir });
        alreadyMerged = true;
      } catch { /* non-zero exit = not ancestor = not merged */ }

      return {
        ok: true,
        featureBranch,
        targetBranch,
        targetWorktreePath: mainWt.path,
        isDirty,
        dirtyFileCount,
        isLocked: featureWt.isLocked || false,
        alreadyMerged,
        commitCount,
        commits,
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('git:merge-and-cleanup', async (_event, workDir, featureWorktreePath, force) => {
    try {
      const info = await getGitInfo(workDir);
      if (!info.isGit) return { ok: false, error: 'Not a git repository' };

      const featureWt = info.worktrees.find(w => w.path === featureWorktreePath);
      if (!featureWt) return { ok: false, error: 'Worktree not found' };

      const mainWt = info.worktrees.find(w => w.isMain);
      if (!mainWt) return { ok: false, error: 'Main worktree not found' };

      const featureBranch = featureWt.branch;
      const targetBranch = mainWt.branch;
      const opts = { encoding: 'utf-8', timeout: 30000 };

      // Merge feature branch into main (must run from main worktree dir)
      try {
        await execFileAsync('git', ['merge', featureBranch], { ...opts, cwd: mainWt.path });
      } catch (mergeErr) {
        const msg = (mergeErr.stderr || mergeErr.stdout || mergeErr.message || '').toString();
        if (msg.includes('CONFLICT') || msg.includes('Automatic merge failed')) {
          try { await execFileAsync('git', ['merge', '--abort'], { ...opts, cwd: mainWt.path }); } catch { /* ignore */ }
          return { ok: false, hasConflicts: true, error: 'Merge conflicts detected. The merge has been aborted — no changes were made.' };
        }
        return { ok: false, error: msg };
      }

      // Cleanup: remove worktree then delete branch
      try {
        const removeArgs = force
          ? ['worktree', 'remove', '--force', featureWorktreePath]
          : ['worktree', 'remove', featureWorktreePath];
        await execFileAsync('git', removeArgs, { ...opts, timeout: 60000, cwd: workDir });

        try {
          await execFileAsync('git', ['branch', '-d', featureBranch], { ...opts, cwd: workDir });
        } catch {
          await execFileAsync('git', ['branch', '-D', featureBranch], { ...opts, cwd: workDir });
        }
      } catch (cleanupErr) {
        return { ok: false, mergeSucceeded: true, cleanupError: cleanupErr.stderr || cleanupErr.message };
      }

      return { ok: true, mergedBranch: featureBranch, targetBranch };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

module.exports = { register };
