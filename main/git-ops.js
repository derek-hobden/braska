const { errMsg, execFileAsync } = require('./utils');
const { getGitInfo } = require('./projects');

function register({ ipcMain }) {
  ipcMain.handle('git:init', async (_event, workDir) => {
    try {
      await execFileAsync('git', ['init'], { cwd: workDir, encoding: 'utf-8', timeout: 10000 });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errMsg(err) };
    }
  });

  ipcMain.handle('git:stage-all', async (_event, workDir) => {
    try {
      await execFileAsync('git', ['add', '-A'], { cwd: workDir, encoding: 'utf-8', timeout: 10000 });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errMsg(err) };
    }
  });

  ipcMain.handle('git:stage', async (_event, workDir, filePaths) => {
    try {
      await execFileAsync('git', ['add', '--', ...filePaths], { cwd: workDir, encoding: 'utf-8', timeout: 10000 });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errMsg(err) };
    }
  });

  ipcMain.handle('git:unstage', async (_event, workDir, filePaths) => {
    try {
      await execFileAsync('git', ['reset', 'HEAD', '--', ...filePaths], { cwd: workDir, encoding: 'utf-8', timeout: 10000 });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errMsg(err) };
    }
  });

  ipcMain.handle('git:commit', async (_event, workDir, message) => {
    try {
      const { stdout } = await execFileAsync('git', ['commit', '-m', message], { cwd: workDir, encoding: 'utf-8', timeout: 15000 });
      return { ok: true, summary: stdout.trim() };
    } catch (err) {
      return { ok: false, error: errMsg(err) };
    }
  });

  ipcMain.handle('git:generate-commit-msg', async (_event, workDir) => {
    try {
      const { stdout: patch } = await execFileAsync('git', ['diff', '--cached'], { cwd: workDir, encoding: 'utf-8', timeout: 10000, maxBuffer: 10 * 1024 * 1024 });
      if (!patch.trim()) return { ok: false, error: 'No staged changes' };
      let truncated = patch;
      if (truncated.length > 20000) truncated = truncated.slice(0, 20000) + '\n\n[diff truncated]';
      const prompt = `Write a commit message for this diff. First line: concise summary under 72 chars. If the change is non-trivial, add a blank line then bullet points explaining what changed. Output ONLY the message, no fences or quotes.\n\n${truncated}`;
      return new Promise((resolve) => {
        const child = require('child_process').execFile(
          'claude', ['-p', '--model', 'claude-haiku-4-5-20251001', '--max-turns', '1'],
          { cwd: workDir, encoding: 'utf-8', timeout: 30000, maxBuffer: 1024 * 1024 },
          (error, stdout, stderr) => {
            if (error) resolve({ ok: false, error: ((stderr || error.message || '').toString().split('\n')[0]) || 'Generation failed' });
            else resolve({ ok: true, message: stdout.trim() });
          }
        );
        child.stdin.end(prompt);
      });
    } catch (err) {
      return { ok: false, error: errMsg(err) };
    }
  });

  ipcMain.handle('git:generate-pr-msg', async (_event, workDir) => {
    try {
      const { stdout: log } = await execFileAsync('git', ['log', 'main..HEAD', '--format=%s%n%b', '--no-merges'], { cwd: workDir, encoding: 'utf-8', timeout: 10000 });
      if (!log.trim()) return { ok: false, error: 'No commits ahead of main' };
      const { stdout: stat } = await execFileAsync('git', ['diff', 'main...HEAD', '--stat'], { cwd: workDir, encoding: 'utf-8', timeout: 10000 });
      let truncLog = log.length > 15000 ? log.slice(0, 15000) + '\n\n[log truncated]' : log;
      let truncStat = stat.length > 5000 ? stat.slice(0, 5000) + '\n\n[stat truncated]' : stat;
      const prompt = `Write a pull request title and description for these changes.\n\nCOMMIT LOG:\n${truncLog}\nFILES CHANGED:\n${truncStat}\nOutput format — first line is the PR title (concise, under 72 chars), then a blank line, then the PR body in markdown. The body should have a brief summary paragraph, then a bulleted list of key changes. Output ONLY the title and body, no fences or quotes.`;
      return new Promise((resolve) => {
        const child = require('child_process').execFile(
          'claude', ['-p', '--model', 'claude-haiku-4-5-20251001', '--max-turns', '1'],
          { cwd: workDir, encoding: 'utf-8', timeout: 30000, maxBuffer: 1024 * 1024 },
          (error, stdout, stderr) => {
            if (error) resolve({ ok: false, error: ((stderr || error.message || '').toString().split('\n')[0]) || 'Generation failed' });
            else {
              const text = stdout.trim();
              const blankIdx = text.indexOf('\n\n');
              if (blankIdx === -1) resolve({ ok: true, title: text, body: '' });
              else resolve({ ok: true, title: text.slice(0, blankIdx).trim(), body: text.slice(blankIdx + 2).trim() });
            }
          }
        );
        child.stdin.end(prompt);
      });
    } catch (err) {
      return { ok: false, error: errMsg(err) };
    }
  });

  ipcMain.handle('git:fetch', async (_event, workDir) => {
    try {
      const { stdout, stderr } = await execFileAsync('git', ['fetch', '--all'], { cwd: workDir, encoding: 'utf-8', timeout: 30000 });
      return { ok: true, output: (stdout + stderr).trim() };
    } catch (err) {
      return { ok: false, error: errMsg(err) };
    }
  });

  ipcMain.handle('git:pull', async (_event, workDir) => {
    try {
      const opts = { cwd: workDir, encoding: 'utf-8', timeout: 30000 };
      // Determine current branch so we can pull explicitly from origin,
      // avoiding "no tracking information" errors when upstream isn't configured.
      let pullArgs = ['pull'];
      try {
        const { stdout: branchOut } = await execFileAsync('git', ['symbolic-ref', '--short', 'HEAD'], { ...opts, timeout: 5000 });
        const branch = branchOut.trim();
        if (branch) pullArgs = ['pull', 'origin', branch];
      } catch { /* detached HEAD or error — fall back to bare pull */ }

      const { stdout } = await execFileAsync('git', pullArgs, opts);
      return { ok: true, output: stdout.trim() };
    } catch (err) {
      const msg = (err.stderr || err.message || '').toString();
      const hasConflicts = msg.includes('CONFLICT') || msg.includes('Automatic merge failed');
      return { ok: false, error: msg.split('\n')[0], hasConflicts };
    }
  });

  ipcMain.handle('git:push', async (_event, workDir) => {
    try {
      await execFileAsync('git', ['push'], { cwd: workDir, encoding: 'utf-8', timeout: 30000 });
      return { ok: true };
    } catch (err) {
      const msg = (err.stderr || err.message || '').toString();
      const noUpstream = msg.includes('no upstream') || msg.includes('has no upstream branch');
      return { ok: false, error: msg.split('\n')[0], noUpstream };
    }
  });

  ipcMain.handle('git:push-set-upstream', async (_event, workDir, branch) => {
    try {
      await execFileAsync('git', ['push', '--set-upstream', 'origin', branch], { cwd: workDir, encoding: 'utf-8', timeout: 30000 });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errMsg(err) };
    }
  });

  ipcMain.handle('git:current-branch', async (_event, workDir) => {
    try {
      const opts = { cwd: workDir, encoding: 'utf-8', timeout: 5000 };
      const { stdout } = await execFileAsync('git', ['symbolic-ref', '--short', 'HEAD'], opts);
      return stdout.trim();
    } catch {
      try {
        const { stdout } = await execFileAsync('git', ['rev-parse', '--short', 'HEAD'], { cwd: workDir, encoding: 'utf-8', timeout: 5000 });
        return '(detached: ' + stdout.trim() + ')';
      } catch { return ''; }
    }
  });

  ipcMain.handle('git:branch-list', async (_event, workDir) => {
    try {
      const opts = { cwd: workDir, encoding: 'utf-8', timeout: 5000 };
      const fmt = '%(refname:short)%00%(HEAD)%00%(upstream:short)%00%(upstream:track,nobracket)';
      const { stdout } = await execFileAsync('git', ['branch', `--format=${fmt}`], opts);
      const out = stdout.trim();
      if (!out) return [];
      const wtInfo = await getGitInfo(workDir);
      const wtBranches = new Map();
      for (const w of wtInfo.worktrees) {
        if (w.branch && w.branch !== '(detached)') wtBranches.set(w.branch, w.path);
      }
      return out.split('\n').filter(Boolean).map(line => {
        const [name, head, tracking, trackInfo] = line.split('\0');
        const isCurrent = head === '*';
        const inWorktree = !isCurrent && wtBranches.has(name);
        const worktreePath = inWorktree ? wtBranches.get(name) : null;
        let ahead = 0, behind = 0;
        if (trackInfo) {
          const aMatch = trackInfo.match(/ahead (\d+)/);
          const bMatch = trackInfo.match(/behind (\d+)/);
          if (aMatch) ahead = parseInt(aMatch[1]);
          if (bMatch) behind = parseInt(bMatch[1]);
        }
        return { name, isCurrent, tracking: tracking || null, ahead, behind, inWorktree, worktreePath };
      });
    } catch { return []; }
  });

  ipcMain.handle('git:branch-create', async (_event, workDir, name, startPoint) => {
    try {
      const args = ['branch', name];
      if (startPoint) args.push(startPoint);
      await execFileAsync('git', args, { cwd: workDir, encoding: 'utf-8', timeout: 10000 });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errMsg(err) };
    }
  });

  ipcMain.handle('git:branch-switch', async (_event, workDir, name) => {
    try {
      const wtInfo = await getGitInfo(workDir);
      for (const w of wtInfo.worktrees) {
        if (w.branch === name && !w.isMain) {
          return { ok: false, error: `Branch '${name}' is checked out in worktree at ${w.path}`, inWorktree: true };
        }
      }
      await execFileAsync('git', ['switch', name], { cwd: workDir, encoding: 'utf-8', timeout: 10000 });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errMsg(err) };
    }
  });

  ipcMain.handle('git:branch-delete', async (_event, workDir, name, force) => {
    try {
      const wtInfo = await getGitInfo(workDir);
      for (const w of wtInfo.worktrees) {
        if (w.branch === name) {
          return { ok: false, error: `Branch '${name}' is checked out in a worktree at ${w.path}` };
        }
      }
      const flag = force ? '-D' : '-d';
      await execFileAsync('git', ['branch', flag, name], { cwd: workDir, encoding: 'utf-8', timeout: 10000 });
      return { ok: true };
    } catch (err) {
      const msg = (err.stderr || err.message || '').toString();
      const notMerged = msg.includes('not fully merged');
      return { ok: false, error: msg.split('\n')[0], notMerged };
    }
  });

  ipcMain.handle('git:stash-list', async (_event, workDir) => {
    try {
      const { stdout } = await execFileAsync('git', ['stash', 'list', '--format=%gd%x00%s%x00%ar'], { cwd: workDir, encoding: 'utf-8', timeout: 5000 });
      const out = stdout.trim();
      if (!out) return [];
      return out.split('\n').map(line => {
        const [ref, message, date] = line.split('\0');
        return { ref, message, date };
      });
    } catch { return []; }
  });

  ipcMain.handle('git:stash-save', async (_event, workDir, message) => {
    try {
      const args = message ? ['stash', 'push', '-u', '-m', message] : ['stash', 'push', '-u'];
      await execFileAsync('git', args, { cwd: workDir, encoding: 'utf-8', timeout: 10000 });
      return { ok: true };
    } catch (err) {
      const msg = (err.stderr || err.message || '').toString();
      if (msg.includes('No local changes')) return { ok: false, error: 'No changes to stash' };
      return { ok: false, error: msg.split('\n')[0] };
    }
  });

  ipcMain.handle('git:stash-pop', async (_event, workDir, index) => {
    try {
      const n = parseInt(index) || 0;
      await execFileAsync('git', ['stash', 'pop', `stash@{${n}}`], { cwd: workDir, encoding: 'utf-8', timeout: 10000 });
      return { ok: true };
    } catch (err) {
      const msg = (err.stderr || err.message || '').toString();
      const hasConflicts = msg.includes('CONFLICT') || msg.includes('could not apply');
      return { ok: false, error: msg.split('\n')[0], hasConflicts };
    }
  });

  ipcMain.handle('git:stash-drop', async (_event, workDir, index) => {
    try {
      const n = parseInt(index) || 0;
      await execFileAsync('git', ['stash', 'drop', `stash@{${n}}`], { cwd: workDir, encoding: 'utf-8', timeout: 5000 });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errMsg(err) };
    }
  });

  ipcMain.handle('git:discard', async (_event, workDir, filePaths) => {
    try {
      // git restore works for modified/deleted working tree changes;
      // fall back to checkout HEAD for edge cases (e.g. files absent from index)
      try {
        await execFileAsync('git', ['restore', '--', ...filePaths], { cwd: workDir, encoding: 'utf-8', timeout: 10000 });
      } catch {
        await execFileAsync('git', ['checkout', 'HEAD', '--', ...filePaths], { cwd: workDir, encoding: 'utf-8', timeout: 10000 });
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: errMsg(err) };
    }
  });

  ipcMain.handle('git:amend', async (_event, workDir, message) => {
    try {
      const args = message ? ['commit', '--amend', '-m', message] : ['commit', '--amend', '--no-edit'];
      const { stdout } = await execFileAsync('git', args, { cwd: workDir, encoding: 'utf-8', timeout: 15000 });
      return { ok: true, summary: stdout.trim() };
    } catch (err) {
      return { ok: false, error: errMsg(err) };
    }
  });

  ipcMain.handle('git:revert-commit', async (_event, workDir, hash) => {
    if (!/^[0-9a-f]+$/i.test(hash)) return { ok: false, error: 'Invalid hash' };
    try {
      await execFileAsync('git', ['revert', hash, '--no-edit'], { cwd: workDir, encoding: 'utf-8', timeout: 15000 });
      return { ok: true };
    } catch (err) {
      const msg = (err.stderr || err.message || '').toString();
      const hasConflicts = msg.includes('CONFLICT') || msg.includes('could not revert');
      return { ok: false, error: msg.split('\n')[0], hasConflicts };
    }
  });
}

module.exports = { register };
