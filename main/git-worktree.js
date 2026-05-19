const { pathExists, errMsg, execFileAsync } = require('./utils');
const { getGitInfo, loadWorktreeIssues, saveWorktreeIssues } = require('./projects');

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
        try {
          await execFileAsync('git', ['fetch', 'origin', mainBranch], opts);
        } catch (fetchErr) {
          if (didStash) {
            try { await execFileAsync('git', ['stash', 'pop'], opts); } catch { /* ignore */ }
          }
          const msg = (fetchErr.stderr || fetchErr.message || '').toString();
          if (fetchErr.killed || (fetchErr.signal && fetchErr.signal === 'SIGTERM')) {
            return { ok: false, error: 'Fetch timed out — check your network connection' };
          }
          if (msg.includes('Authentication') || msg.includes('could not read Username')) {
            return { ok: false, error: 'Authentication failed — check your git credentials' };
          }
          return { ok: false, error: `Fetch failed: ${msg.split('\n')[0]}` };
        }
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

  ipcMain.handle('git:remote-branches', async (_event, workDir) => {
    try {
      const { stdout } = await execFileAsync('git', ['branch', '-r', '--format=%(refname:short)'], { cwd: workDir, encoding: 'utf-8', timeout: 5000 });
      const out = stdout.trim();
      if (!out) return [];
      return out.split('\n').filter(b => b && !b.endsWith('/HEAD'));
    } catch { return []; }
  });

  ipcMain.handle('git:worktree-add', async (_event, workDir, worktreePath, branch, createNew) => {
    const t0 = Date.now();
    try {
      const opts = { cwd: workDir, encoding: 'utf-8', timeout: 30000 };
      const addArgs = createNew
        ? ['worktree', 'add', '-b', branch, worktreePath]
        : ['worktree', 'add', worktreePath, branch];
      await execFileAsync('git', addArgs, opts);
      console.log(`[diag] git:worktree-add ${branch} took ${Date.now() - t0}ms`);
      return { ok: true };
    } catch (err) {
      if (err.stderr && err.stderr.includes('already exists')) {
        try {
          if (await pathExists(worktreePath)) {
            await execFileAsync('git', ['worktree', 'remove', '--force', worktreePath], { cwd: workDir, encoding: 'utf-8', timeout: 60000 });
          }
          await execFileAsync('git', ['worktree', 'add', worktreePath, branch], { cwd: workDir, encoding: 'utf-8', timeout: 30000 });
          console.log(`[diag] git:worktree-add ${branch} (retry) took ${Date.now() - t0}ms`);
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

      // Resolve the branch for this worktree before removing it. We always need
      // it so we can also clean up the issue-link JSON entry (regardless of
      // whether the user asked to delete the branch).
      const info = await getGitInfo(workDir);
      const wt = info.worktrees.find(w => w.path === worktreePath);
      const removedBranch = wt && wt.branch && !wt.isMain && wt.branch !== '(detached)' ? wt.branch : null;
      const wtBranch = deleteBranch ? removedBranch : null;
      const mainWt = info.worktrees.find(w => w.isMain);

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

      // Clean up the worktree↔issue link so the JSON file doesn't accumulate
      // stale entries pointing at branches that no longer exist as worktrees.
      if (removedBranch && mainWt) {
        try {
          const map = await loadWorktreeIssues(mainWt.path);
          if (map[removedBranch]) {
            delete map[removedBranch];
            await saveWorktreeIssues(mainWt.path, map);
          }
        } catch { /* ignore — best-effort cleanup */ }
      }

      return { ok: true };
    } catch (err) {
      const msg = (err.stderr || err.message || '').toString();
      const isDirty = msg.includes('modified') || msg.includes('untracked') || msg.includes('changes');
      const isLocked = msg.includes('locked');
      return { ok: false, error: msg.split('\n')[0], isDirty, isLocked };
    }
  });

  ipcMain.handle('worktree:link-issue', async (_event, workDir, branch, issueNumber) => {
    try {
      if (typeof branch !== 'string' || !branch) return { ok: false, error: 'Missing branch' };
      if (!Number.isInteger(issueNumber) || issueNumber <= 0) return { ok: false, error: 'Invalid issue number' };
      const info = await getGitInfo(workDir);
      const mainWt = info.worktrees.find(w => w.isMain);
      if (!mainWt) return { ok: false, error: 'Main worktree not found' };
      const map = await loadWorktreeIssues(mainWt.path);
      map[branch] = { issue: issueNumber, createdAt: new Date().toISOString() };
      await saveWorktreeIssues(mainWt.path, map);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errMsg(err) };
    }
  });

  ipcMain.handle('worktree:unlink-issue', async (_event, workDir, branch) => {
    try {
      if (typeof branch !== 'string' || !branch) return { ok: false, error: 'Missing branch' };
      const info = await getGitInfo(workDir);
      const mainWt = info.worktrees.find(w => w.isMain);
      if (!mainWt) return { ok: false, error: 'Main worktree not found' };
      const map = await loadWorktreeIssues(mainWt.path);
      if (map[branch]) {
        delete map[branch];
        await saveWorktreeIssues(mainWt.path, map);
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errMsg(err) };
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

  // Shared: merge a branch into main, abort on conflicts
  async function mergeIntoMain(workDir, featureBranch, mainWtPath) {
    const opts = { encoding: 'utf-8', timeout: 30000 };
    try {
      await execFileAsync('git', ['merge', featureBranch], { ...opts, cwd: mainWtPath });
      return { ok: true };
    } catch (mergeErr) {
      const msg = (mergeErr.stderr || mergeErr.stdout || mergeErr.message || '').toString();
      if (msg.includes('CONFLICT') || msg.includes('Automatic merge failed')) {
        try { await execFileAsync('git', ['merge', '--abort'], { ...opts, cwd: mainWtPath }); } catch { /* ignore */ }
        return { ok: false, hasConflicts: true, error: 'Merge conflicts — the merge has been aborted' };
      }
      return { ok: false, error: msg.split('\n')[0] };
    }
  }

  ipcMain.handle('git:merge-and-cleanup', async (_event, workDir, featureWorktreePath, force) => {
    try {
      const info = await getGitInfo(workDir);
      if (!info.isGit) return { ok: false, error: 'Not a git repository' };
      const featureWt = info.worktrees.find(w => w.path === featureWorktreePath);
      if (!featureWt) return { ok: false, error: 'Worktree not found' };
      const mainWt = info.worktrees.find(w => w.isMain);
      if (!mainWt) return { ok: false, error: 'Main worktree not found' };
      const featureBranch = featureWt.branch;

      const merge = await mergeIntoMain(workDir, featureBranch, mainWt.path);
      if (!merge.ok) return merge;

      try {
        const removeArgs = force
          ? ['worktree', 'remove', '--force', featureWorktreePath]
          : ['worktree', 'remove', featureWorktreePath];
        const opts = { encoding: 'utf-8', timeout: 60000 };
        await execFileAsync('git', removeArgs, { ...opts, cwd: workDir });
        try { await execFileAsync('git', ['branch', '-d', featureBranch], { ...opts, cwd: workDir }); }
        catch { await execFileAsync('git', ['branch', '-D', featureBranch], { ...opts, cwd: workDir }); }
      } catch (cleanupErr) {
        return { ok: false, mergeSucceeded: true, cleanupError: cleanupErr.stderr || cleanupErr.message };
      }
      return { ok: true, mergedBranch: featureBranch, targetBranch: mainWt.branch };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // Lightweight merge: merge feature branch into main without cleanup
  ipcMain.handle('git:merge-to-main', async (_event, workDir) => {
    try {
      const info = await getGitInfo(workDir);
      if (!info.isGit) return { ok: false, error: 'Not a git repository' };
      const featureWt = info.worktrees.find(w => w.path === workDir);
      if (!featureWt) return { ok: false, error: 'Worktree not found' };
      if (featureWt.isMain) return { ok: false, error: 'Already on the main branch' };
      if (featureWt.branch === '(detached)') return { ok: false, error: 'Cannot merge a detached HEAD' };
      const mainWt = info.worktrees.find(w => w.isMain);
      if (!mainWt) return { ok: false, error: 'Main worktree not found' };

      const featureBranch = featureWt.branch;
      const { stdout: statusOut } = await execFileAsync('git', ['status', '--porcelain'], { cwd: workDir, encoding: 'utf-8', timeout: 10000 });
      if (statusOut.trim()) return { ok: false, isDirty: true, error: 'Commit your changes before merging' };

      try {
        await execFileAsync('git', ['merge-base', '--is-ancestor', featureBranch, mainWt.branch], { cwd: workDir, encoding: 'utf-8', timeout: 10000 });
        return { ok: false, alreadyMerged: true, error: 'Already merged into ' + mainWt.branch };
      } catch { /* not merged yet */ }

      const merge = await mergeIntoMain(workDir, featureBranch, mainWt.path);
      if (!merge.ok) return merge;
      return { ok: true, featureBranch, targetBranch: mainWt.branch, mainWorktreePath: mainWt.path };
    } catch (err) {
      return { ok: false, error: errMsg(err) };
    }
  });

  // Push from the main worktree (used after merge-to-main)
  ipcMain.handle('git:push-main', async (_event, workDir) => {
    try {
      const info = await getGitInfo(workDir);
      if (!info.isGit) return { ok: false, error: 'Not a git repository' };
      const mainWt = info.worktrees.find(w => w.isMain);
      if (!mainWt) return { ok: false, error: 'Main worktree not found' };
      await execFileAsync('git', ['push'], { cwd: mainWt.path, encoding: 'utf-8', timeout: 30000 });
      return { ok: true, targetBranch: mainWt.branch };
    } catch (err) {
      const msg = (err.stderr || err.message || '').toString();
      return { ok: false, error: msg.split('\n')[0] };
    }
  });

  // Quick check: does origin point to GitHub?
  ipcMain.handle('git:is-github-repo', async (_event, workDir) => {
    try {
      const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], { cwd: workDir, encoding: 'utf-8', timeout: 5000 });
      return { ok: true, isGitHub: /github\.com/i.test(stdout) };
    } catch {
      return { ok: true, isGitHub: false };
    }
  });
}

module.exports = { register };
