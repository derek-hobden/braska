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

// Per-repo file linking worktree branches to GitHub issue numbers.
// Lives in the main worktree's `.the-agency/`; keyed by branch name (paths differ per machine).
function getWorktreeIssuesFile(mainWtPath) {
  return path.join(mainWtPath, '.the-agency', 'worktree-issues.json');
}

// Pure read — never mkdir here. getGitInfo() is called on every projects.list()
// and the main-process fs.watch is recursive; any mkdir in the hot path can trigger
// a refresh loop (same class of bug as the 2026-03-29 tickets-panel incident).
async function loadWorktreeIssues(mainWtPath) {
  try {
    const raw = await fsp.readFile(getWorktreeIssuesFile(mainWtPath), 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}

async function saveWorktreeIssues(mainWtPath, map) {
  const file = getWorktreeIssuesFile(mainWtPath);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, JSON.stringify(map, null, 2));
}

const ISSUE_BRANCH_RE = /^(?:[\w.-]+\/)?(?:gh-)?issue-(\d+)$/;

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

    // Merge GitHub issue links into each worktree. Explicit JSON entries win;
    // otherwise fall back to a regex on the branch name so CLI-created worktrees
    // (e.g. `git worktree add … gh-issue-99`) still get the icon.
    const mainWt = worktrees.find(w => w.isMain);
    const linkMap = mainWt ? await loadWorktreeIssues(mainWt.path) : {};
    for (const wt of worktrees) {
      if (!wt.branch) continue;
      const explicit = linkMap[wt.branch];
      if (explicit && Number.isInteger(explicit.issue)) {
        wt.githubIssue = explicit.issue;
        continue;
      }
      const m = wt.branch.match(ISSUE_BRANCH_RE);
      if (m) wt.githubIssue = parseInt(m[1], 10);
    }

    return { isGit: true, isGitHub, worktrees };
  } catch {
    return { isGit: false, isGitHub: false, worktrees: [] };
  }
}

async function addProjectByPath(app, folderPath) {
  const projects = await loadProjects(app);
  const existing = projects.find((p) => p.path === folderPath);
  if (existing) return existing;
  const project = { path: folderPath, name: path.basename(folderPath) };
  projects.push(project);
  await saveProjects(app, projects);
  return project;
}

function register({ ipcMain, app, dialog, BrowserWindow }) {
  ipcMain.handle('projects:list', async () => {
    const projects = await loadProjects(app);
    return Promise.all(projects.map(async p => ({ ...p, ...(await getGitInfo(p.path)) })));
  });

  ipcMain.handle('projects:add', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
    });
    if (canceled || filePaths.length === 0) return null;
    return addProjectByPath(app, filePaths[0]);
  });

  ipcMain.handle('projects:pick-clone-dir', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: 'Choose where to clone',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (canceled || filePaths.length === 0) return { ok: false };
    return { ok: true, path: filePaths[0] };
  });

  ipcMain.handle('projects:add-cloned', async (_event, clonedPath) => {
    if (!await pathExists(path.join(clonedPath, '.git'))) {
      return { ok: false, error: 'Cloned folder is not a git repository.' };
    }
    const project = await addProjectByPath(app, clonedPath);
    return { ok: true, project };
  });

  ipcMain.handle('projects:remove', async (_event, projectPath) => {
    const projects = (await loadProjects(app)).filter((p) => p.path !== projectPath);
    await saveProjects(app, projects);
    return Promise.all(projects.map(async p => ({ ...p, ...(await getGitInfo(p.path)) })));
  });
}

module.exports = { register, getGitInfo, loadProjects, loadWorktreeIssues, saveWorktreeIssues, ISSUE_BRANCH_RE };
