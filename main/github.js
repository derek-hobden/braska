const path = require('path');
const { resolveInDir, execFileAsync, fsp, errMsg, pathExists } = require('./utils');
const { getTodoDir } = require('./todo');
const { getGitInfo } = require('./projects');

// gh prints various phrasings on missing/expired credentials; match the common ones.
function isAuthError(err) {
  const combined = ((err.stderr || '') + (err.message || '')).toLowerCase();
  return combined.includes('not logged') || combined.includes('authentication') || combined.includes('gh auth');
}

// owner/repo per GitHub's allowed characters; rejects leading dashes so `gh` can't
// interpret repoRef as a flag (execFileAsync prevents shell injection, but `gh`
// itself still parses leading-dash tokens as options).
const REPO_REF_RE = /^[A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]+$/;

function register({ ipcMain }) {
  ipcMain.handle('gh:auth-status', async (_event, workDir) => {
    let authenticated = false, user = '';
    try {
      const { stdout } = await execFileAsync('gh', ['auth', 'status'], { cwd: workDir, encoding: 'utf-8', timeout: 10000 });
      authenticated = true;
      const m = stdout.match(/Logged in to .+ as (\S+)/);
      if (m) user = m[1];
    } catch (err) {
      const combined = (err.stdout || '') + (err.stderr || '');
      const m = combined.match(/Logged in to .+ as (\S+)/);
      if (m) { authenticated = true; user = m[1]; }
    }
    let isGitHubRepo = false, repo = null;
    if (authenticated) {
      try {
        const { stdout } = await execFileAsync('gh', ['repo', 'view', '--json', 'owner,name,url,defaultBranchRef'], { cwd: workDir, encoding: 'utf-8', timeout: 10000 });
        repo = JSON.parse(stdout);
        isGitHubRepo = true;
      } catch {}
    }
    return { authenticated, user, isGitHubRepo, repo };
  });

  ipcMain.handle('gh:list-repos', async () => {
    try {
      // REST /user/repos with explicit affiliations so the picker shows org + collaborator repos,
      // not just the user's own. `gh repo list` alone can't do this in one call.
      const { stdout } = await execFileAsync('gh', [
        'api', '/user/repos?affiliation=owner,collaborator,organization_member&sort=updated&per_page=100',
      ], { encoding: 'utf-8', timeout: 20000 });
      const raw = JSON.parse(stdout);
      const repos = raw.map(r => ({
        nameWithOwner: r.full_name,
        description: r.description,
        visibility: r.visibility,
        updatedAt: r.updated_at,
        isPrivate: r.private,
        isFork: r.fork,
        sshUrl: r.ssh_url,
        url: r.html_url,
      }));
      return { ok: true, repos };
    } catch (err) {
      if (isAuthError(err)) {
        return { ok: false, error: 'Not authenticated with GitHub. Run `gh auth login` in a terminal.', needsAuth: true };
      }
      return { ok: false, error: errMsg(err) };
    }
  });

  ipcMain.handle('gh:clone', async (_event, repoRef, targetDir) => {
    try {
      if (!repoRef || !targetDir) return { ok: false, error: 'Missing repo or target directory.' };
      if (typeof repoRef !== 'string' || !REPO_REF_RE.test(repoRef)) {
        return { ok: false, error: 'Invalid repo reference.' };
      }
      if (typeof targetDir !== 'string' || !path.isAbsolute(targetDir)) {
        return { ok: false, error: 'Target must be an absolute path.' };
      }
      if (await pathExists(targetDir)) {
        return { ok: false, error: `Target directory already exists: ${targetDir}` };
      }
      await execFileAsync('gh', ['repo', 'clone', repoRef, targetDir], { encoding: 'utf-8', timeout: 300000 });
      return { ok: true, path: targetDir };
    } catch (err) {
      if (isAuthError(err)) {
        return { ok: false, error: 'Not authenticated with GitHub. Run `gh auth login` in a terminal.', needsAuth: true };
      }
      return { ok: false, error: errMsg(err) };
    }
  });

  ipcMain.handle('gh:pr-list', async (_event, workDir, state) => {
    try {
      const { stdout } = await execFileAsync('gh', [
        'pr', 'list', '--state', state || 'open',
        '--json', 'number,title,state,author,createdAt,updatedAt,headRefName,baseRefName,isDraft,reviewDecision,statusCheckRollup,url',
        '--limit', '50'
      ], { cwd: workDir, encoding: 'utf-8', timeout: 15000 });
      return { ok: true, data: JSON.parse(stdout) };
    } catch (err) { return { ok: false, error: err.stderr || err.message }; }
  });

  ipcMain.handle('gh:pr-view', async (_event, workDir, number) => {
    try {
      const { stdout } = await execFileAsync('gh', [
        'pr', 'view', String(number),
        '--json', 'number,title,body,state,author,createdAt,updatedAt,headRefName,baseRefName,isDraft,reviewDecision,mergeable,statusCheckRollup,reviews,comments,url,additions,deletions,files'
      ], { cwd: workDir, encoding: 'utf-8', timeout: 15000 });
      return { ok: true, data: JSON.parse(stdout) };
    } catch (err) { return { ok: false, error: err.stderr || err.message }; }
  });

  ipcMain.handle('gh:pr-for-branch', async (_event, workDir) => {
    try {
      const { stdout: branchOut } = await execFileAsync('git', ['symbolic-ref', '--short', 'HEAD'], { cwd: workDir, encoding: 'utf-8', timeout: 5000 });
      const branch = branchOut.trim();
      const { stdout } = await execFileAsync('gh', [
        'pr', 'list', '--head', branch, '--json', 'number,url,statusCheckRollup', '--limit', '1'
      ], { cwd: workDir, encoding: 'utf-8', timeout: 10000 });
      const prs = JSON.parse(stdout);
      return { ok: true, pr: prs.length ? prs[0] : null };
    } catch { return { ok: true, pr: null }; }
  });

  ipcMain.handle('gh:pr-create', async (_event, workDir, title, body, base, draft) => {
    try {
      const args = ['pr', 'create', '--title', title, '--body', body];
      if (base) args.push('--base', base);
      if (draft) args.push('--draft');
      const { stdout } = await execFileAsync('gh', args, { cwd: workDir, encoding: 'utf-8', timeout: 30000 });
      return { ok: true, url: stdout.trim() };
    } catch (err) { return { ok: false, error: err.stderr || err.message }; }
  });

  ipcMain.handle('gh:pr-merge', async (_event, workDir, number, method, deleteBranch) => {
    try {
      const info = await getGitInfo(workDir);
      const mainWt = info.worktrees.find(w => w.isMain);

      const flag = method === 'squash' ? '--squash' : method === 'rebase' ? '--rebase' : '--merge';
      // Never pass --delete-branch to gh — it fails when the branch is used by a worktree.
      // We handle all branch/worktree cleanup ourselves below.
      await execFileAsync('gh', ['pr', 'merge', String(number), flag], { cwd: workDir, encoding: 'utf-8', timeout: 30000 });

      if (!deleteBranch) return { ok: true };

      // Look up the PR's branch so we can check for worktrees
      let prBranch;
      try {
        const { stdout } = await execFileAsync('gh', ['pr', 'view', String(number), '--json', 'headRefName', '-q', '.headRefName'], { cwd: workDir, encoding: 'utf-8', timeout: 15000 });
        prBranch = stdout.trim();
      } catch { return { ok: true }; }

      const opts = { encoding: 'utf-8', timeout: 60000 };
      const cleanupCwd = mainWt ? mainWt.path : workDir;
      const branchWt = prBranch ? info.worktrees.find(w => w.branch === prBranch && !w.isMain) : null;

      // Delete remote branch (may already be deleted by GitHub auto-delete)
      if (prBranch) {
        try { await execFileAsync('git', ['push', 'origin', '--delete', prBranch], { ...opts, cwd: cleanupCwd }); } catch {}
      }

      // If a worktree uses the branch, remove it first
      let worktreeCleanedUp = false;
      if (branchWt) {
        try {
          await execFileAsync('git', ['worktree', 'remove', '--force', branchWt.path], { ...opts, cwd: cleanupCwd });
          worktreeCleanedUp = true;
        } catch {}
      }

      // Delete local branch (skip if worktree removal failed — branch is still in use)
      if (!branchWt || worktreeCleanedUp) {
        try { await execFileAsync('git', ['branch', '-D', prBranch], { ...opts, cwd: cleanupCwd }); } catch {}
      }

      if (worktreeCleanedUp) {
        return { ok: true, worktreeCleanedUp, cleanedWorktreePath: branchWt.path, mainWorktreePath: cleanupCwd };
      }
      return { ok: true };
    } catch (err) { return { ok: false, error: errMsg(err) }; }
  });

  ipcMain.handle('gh:pr-close', async (_event, workDir, number) => {
    try {
      await execFileAsync('gh', ['pr', 'close', String(number)], { cwd: workDir, encoding: 'utf-8', timeout: 15000 });
      return { ok: true };
    } catch (err) { return { ok: false, error: err.stderr || err.message }; }
  });

  ipcMain.handle('gh:pr-comment', async (_event, workDir, number, body) => {
    try {
      await execFileAsync('gh', ['pr', 'comment', String(number), '--body', body], { cwd: workDir, encoding: 'utf-8', timeout: 15000 });
      return { ok: true };
    } catch (err) { return { ok: false, error: err.stderr || err.message }; }
  });

  ipcMain.handle('gh:issue-list', async (_event, workDir, state, labels) => {
    try {
      const args = ['issue', 'list', '--state', state || 'open',
        '--json', 'number,title,state,author,createdAt,labels,url', '--limit', '50'];
      if (labels && labels.length) for (const l of labels) args.push('--label', l);
      const { stdout } = await execFileAsync('gh', args, { cwd: workDir, encoding: 'utf-8', timeout: 15000 });
      return { ok: true, data: JSON.parse(stdout) };
    } catch (err) { return { ok: false, error: err.stderr || err.message }; }
  });

  ipcMain.handle('gh:issue-view', async (_event, workDir, number) => {
    try {
      const { stdout } = await execFileAsync('gh', [
        'issue', 'view', String(number),
        '--json', 'number,title,body,state,author,createdAt,labels,comments,url,assignees'
      ], { cwd: workDir, encoding: 'utf-8', timeout: 15000 });
      return { ok: true, data: JSON.parse(stdout) };
    } catch (err) { return { ok: false, error: err.stderr || err.message }; }
  });

  ipcMain.handle('gh:issue-create', async (_event, workDir, title, body, labels) => {
    try {
      const args = ['issue', 'create', '--title', title, '--body', body || ''];
      if (labels && labels.length) for (const l of labels) args.push('--label', l);
      const { stdout } = await execFileAsync('gh', args, { cwd: workDir, encoding: 'utf-8', timeout: 30000 });
      return { ok: true, url: stdout.trim() };
    } catch (err) { return { ok: false, error: err.stderr || err.message }; }
  });

  ipcMain.handle('gh:issue-close', async (_event, workDir, number) => {
    try {
      await execFileAsync('gh', ['issue', 'close', String(number)], { cwd: workDir, encoding: 'utf-8', timeout: 15000 });
      return { ok: true };
    } catch (err) { return { ok: false, error: err.stderr || err.message }; }
  });

  ipcMain.handle('gh:issue-comment', async (_event, workDir, number, body) => {
    try {
      await execFileAsync('gh', ['issue', 'comment', String(number), '--body', body], { cwd: workDir, encoding: 'utf-8', timeout: 15000 });
      return { ok: true };
    } catch (err) { return { ok: false, error: err.stderr || err.message }; }
  });

  // Partial edit: only fields present in `changes` get sent to gh.
  // Labels are diffed at the call site (renderer) so we never pass overlapping --add/--remove.
  ipcMain.handle('gh:issue-edit', async (_event, workDir, number, changes) => {
    try {
      const args = ['issue', 'edit', String(number)];
      if (changes && typeof changes.title === 'string') args.push('--title', changes.title);
      if (changes && typeof changes.body === 'string') args.push('--body', changes.body);
      if (changes && Array.isArray(changes.addLabels)) {
        for (const l of changes.addLabels) args.push('--add-label', l);
      }
      if (changes && Array.isArray(changes.removeLabels)) {
        for (const l of changes.removeLabels) args.push('--remove-label', l);
      }
      if (args.length === 3) return { ok: true, noop: true };
      await execFileAsync('gh', args, { cwd: workDir, encoding: 'utf-8', timeout: 30000 });
      return { ok: true };
    } catch (err) { return { ok: false, error: err.stderr || err.message }; }
  });

  ipcMain.handle('gh:issue-reopen', async (_event, workDir, number) => {
    try {
      await execFileAsync('gh', ['issue', 'reopen', String(number)], { cwd: workDir, encoding: 'utf-8', timeout: 15000 });
      return { ok: true };
    } catch (err) { return { ok: false, error: err.stderr || err.message }; }
  });

  ipcMain.handle('gh:issue-labels', async (_event, workDir) => {
    try {
      const { stdout } = await execFileAsync('gh', ['label', 'list', '--json', 'name,color', '--limit', '100'], { cwd: workDir, encoding: 'utf-8', timeout: 15000 });
      return { ok: true, data: JSON.parse(stdout) };
    } catch (err) { return { ok: false, error: err.stderr || err.message }; }
  });

  ipcMain.handle('gh:run-list', async (_event, workDir, branch) => {
    try {
      const args = ['run', 'list', '--json', 'databaseId,displayTitle,conclusion,status,event,createdAt,url', '--limit', '10'];
      if (branch) args.push('--branch', branch);
      const { stdout } = await execFileAsync('gh', args, { cwd: workDir, encoding: 'utf-8', timeout: 15000 });
      return { ok: true, data: JSON.parse(stdout) };
    } catch (err) { return { ok: false, error: err.stderr || err.message }; }
  });

  ipcMain.handle('gh:run-view', async (_event, workDir, runId) => {
    try {
      const { stdout } = await execFileAsync('gh', ['run', 'view', String(runId), '--json', 'databaseId,displayTitle,conclusion,status,jobs,url'], { cwd: workDir, encoding: 'utf-8', timeout: 15000 });
      return { ok: true, data: JSON.parse(stdout) };
    } catch (err) { return { ok: false, error: err.stderr || err.message }; }
  });

  ipcMain.handle('gh:notifications', async (_event, workDir) => {
    try {
      const { stdout: nwo } = await execFileAsync('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], { cwd: workDir, encoding: 'utf-8', timeout: 10000 });
      const { stdout } = await execFileAsync('gh', ['api', `repos/${nwo.trim()}/notifications`, '--cache', '60s'], { cwd: workDir, encoding: 'utf-8', timeout: 15000 });
      return { ok: true, data: JSON.parse(stdout) };
    } catch (err) { return { ok: false, error: err.stderr || err.message }; }
  });

  ipcMain.handle('gh:notifications-mark-read', async (_event, workDir) => {
    try {
      const { stdout: nwo } = await execFileAsync('gh', ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'], { cwd: workDir, encoding: 'utf-8', timeout: 10000 });
      await execFileAsync('gh', ['api', '-X', 'PUT', `repos/${nwo.trim()}/notifications`], { cwd: workDir, encoding: 'utf-8', timeout: 15000 });
      return { ok: true };
    } catch (err) { return { ok: false, error: err.stderr || err.message }; }
  });

  ipcMain.handle('gh:link-ticket', async (_event, workDir, todoRelPath, issueNumber) => {
    try {
      const todoDir = await getTodoDir(workDir);
      const todoPath = resolveInDir(todoDir, todoRelPath);
      let content = await fsp.readFile(todoPath, 'utf-8');
      content = content.replace(/\n## GitHub Issue:.*\n?/g, '');
      const insertPoint = content.indexOf('\n## Tasks');
      if (insertPoint >= 0) {
        content = content.slice(0, insertPoint) + `\n## GitHub Issue: #${issueNumber}` + content.slice(insertPoint);
      } else {
        content = content.trimEnd() + `\n\n## GitHub Issue: #${issueNumber}\n`;
      }
      await fsp.writeFile(todoPath, content, 'utf-8');
      try {
        const todoName = path.basename(todoRelPath, '.md');
        await execFileAsync('gh', ['issue', 'comment', String(issueNumber), '--body', `Linked to Braska todo: ${todoName}`], { cwd: workDir, encoding: 'utf-8', timeout: 15000 });
      } catch {}
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
  });

  ipcMain.handle('gh:unlink-ticket', async (_event, workDir, todoRelPath) => {
    try {
      const todoDir = await getTodoDir(workDir);
      const todoPath = resolveInDir(todoDir, todoRelPath);
      let content = await fsp.readFile(todoPath, 'utf-8');
      content = content.replace(/\n## GitHub Issue:.*\n?/g, '');
      await fsp.writeFile(todoPath, content, 'utf-8');
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
  });
}

module.exports = { register };
