const path = require('path');
const { resolveInDir, execFileAsync, fsp } = require('./utils');
const { getTodoDir } = require('./todo');

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
      const flag = method === 'squash' ? '--squash' : method === 'rebase' ? '--rebase' : '--merge';
      const args = ['pr', 'merge', String(number), flag];
      if (deleteBranch) args.push('--delete-branch');
      await execFileAsync('gh', args, { cwd: workDir, encoding: 'utf-8', timeout: 30000 });
      return { ok: true };
    } catch (err) { return { ok: false, error: err.stderr || err.message }; }
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
      const { stdout } = await execFileAsync('gh', ['api', 'notifications', '--cache', '60s'], { cwd: workDir, encoding: 'utf-8', timeout: 15000 });
      return { ok: true, data: JSON.parse(stdout) };
    } catch (err) { return { ok: false, error: err.stderr || err.message }; }
  });

  ipcMain.handle('gh:link-ticket', async (_event, workDir, todoRelPath, issueNumber) => {
    try {
      const todoDir = await getTodosDir(workDir);
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
      const todoDir = await getTodosDir(workDir);
      const todoPath = resolveInDir(todoDir, todoRelPath);
      let content = await fsp.readFile(todoPath, 'utf-8');
      content = content.replace(/\n## GitHub Issue:.*\n?/g, '');
      await fsp.writeFile(todoPath, content, 'utf-8');
      return { ok: true };
    } catch (err) { return { ok: false, error: err.message }; }
  });
}

module.exports = { register };
