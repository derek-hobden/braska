const path = require('path');
const { pathExists, execFileAsync, fsp } = require('./utils');

function getProjectsFile(app) {
  return path.join(app.getPath('userData'), 'projects.json');
}

async function loadProjects(app) {
  const file = getProjectsFile(app);
  if (!await pathExists(file)) return [];
  return JSON.parse(await fsp.readFile(file, 'utf-8'));
}

async function saveProjects(app, projects) {
  await fsp.writeFile(getProjectsFile(app), JSON.stringify(projects, null, 2));
}

async function getGitInfo(projectPath) {
  try {
    if (!await pathExists(path.join(projectPath, '.git'))) return { isGit: false, worktrees: [] };
    const { stdout: output } = await execFileAsync('git', ['worktree', 'list', '--porcelain'], {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: 5000,
    });
    const worktrees = [];
    let isFirst = true;
    for (const block of output.trim().split('\n\n')) {
      const wt = { isMain: isFirst, isLocked: false };
      isFirst = false;
      for (const line of block.trim().split('\n')) {
        if (line.startsWith('worktree ')) wt.path = line.slice(9);
        else if (line.startsWith('branch ')) wt.branch = line.slice(7).replace('refs/heads/', '');
        else if (line === 'detached') wt.branch = '(detached)';
        else if (line === 'locked' || line.startsWith('locked ')) wt.isLocked = true;
        else if (line === 'prunable' || line.startsWith('prunable ')) wt.isPrunable = true;
      }
      if (wt.path) worktrees.push(wt);
    }
    let isGitHub = false;
    try {
      const { stdout: remoteUrl } = await execFileAsync('git', ['remote', 'get-url', 'origin'], {
        cwd: projectPath, encoding: 'utf-8', timeout: 3000,
      });
      isGitHub = /github\.com/i.test(remoteUrl);
    } catch { /* no origin remote */ }
    return { isGit: true, isGitHub, worktrees };
  } catch {
    return { isGit: false, isGitHub: false, worktrees: [] };
  }
}

function register({ ipcMain, app, dialog, BrowserWindow }) {
  ipcMain.handle('projects:list', async () => {
    const projects = await loadProjects(app);
    return Promise.all(projects.map(async p => ({ ...p, ...(await getGitInfo(p.path)) })));
  });

  ipcMain.handle('projects:add', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
    });
    if (canceled || filePaths.length === 0) return null;
    const folderPath = filePaths[0];
    const projects = await loadProjects(app);
    if (projects.some((p) => p.path === folderPath)) return null;
    const project = { path: folderPath, name: path.basename(folderPath) };
    projects.push(project);
    await saveProjects(app, projects);
    return project;
  });

  ipcMain.handle('projects:remove', async (_event, projectPath) => {
    const projects = (await loadProjects(app)).filter((p) => p.path !== projectPath);
    await saveProjects(app, projects);
    return Promise.all(projects.map(async p => ({ ...p, ...(await getGitInfo(p.path)) })));
  });
}

module.exports = { register, getGitInfo };
