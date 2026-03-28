const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

function getProjectsFile() {
  return path.join(app.getPath('userData'), 'projects.json');
}

function loadProjects() {
  const file = getProjectsFile();
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function saveProjects(projects) {
  fs.writeFileSync(getProjectsFile(), JSON.stringify(projects, null, 2));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  ipcMain.handle('projects:list', () => loadProjects());

  ipcMain.handle('projects:add', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
    });
    if (canceled || filePaths.length === 0) return null;
    const folderPath = filePaths[0];
    const projects = loadProjects();
    if (projects.some((p) => p.path === folderPath)) return null;
    const project = { path: folderPath, name: path.basename(folderPath) };
    projects.push(project);
    saveProjects(projects);
    return project;
  });

  ipcMain.handle('projects:remove', (_event, projectPath) => {
    const projects = loadProjects().filter((p) => p.path !== projectPath);
    saveProjects(projects);
    return projects;
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
