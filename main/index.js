const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const { ptyProcesses } = require('./state');
const { migrateData } = require('./migration');
const { ensureBuiltinSpecialists } = require('./specialists-setup');

process.on('uncaughtException', (err) => {
  console.error('[Braska] Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Braska] Unhandled rejection:', reason);
});

if (process.platform === 'darwin') {
  app.setName('Braska');
}

function createWindow() {
  // Splash screen — shows instantly while main window loads
  const splash = new BrowserWindow({
    width: 340,
    height: 340,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    resizable: false,
    backgroundColor: '#00000000',
  });
  splash.loadFile('splash.html');

  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    show: false,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => {
    // Morph splash into main window shape, then swap
    const endBounds = win.getBounds();
    const startBounds = splash.getBounds();
    const duration = 500;
    const steps = 30;
    let step = 0;

    splash.webContents.executeJavaScript('document.body.classList.add("morph")');

    const interval = setInterval(() => {
      step++;
      const t = step / steps;
      const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic

      splash.setBounds({
        x: Math.round(startBounds.x + (endBounds.x - startBounds.x) * ease),
        y: Math.round(startBounds.y + (endBounds.y - startBounds.y) * ease),
        width: Math.round(startBounds.width + (endBounds.width - startBounds.width) * ease),
        height: Math.round(startBounds.height + (endBounds.height - startBounds.height) * ease),
      });

      if (step >= steps) {
        clearInterval(interval);
        // Solid backdrop behind cross-fade so desktop never shows through
        const backdrop = new BrowserWindow({
          ...endBounds,
          frame: false,
          resizable: false,
          backgroundColor: '#1e1e1e',
          skipTaskbar: true,
        });
        backdrop.show();

        // Cross-fade: fade in app behind splash, then fade out splash
        win.setOpacity(0);
        win.show();
        let fadeStep = 0;
        const fadeSteps = 12;
        const fadeInterval = setInterval(() => {
          fadeStep++;
          const ft = fadeStep / fadeSteps;
          win.setOpacity(ft);
          if (!splash.isDestroyed()) splash.setOpacity(1 - ft);
          if (fadeStep >= fadeSteps) {
            clearInterval(fadeInterval);
            if (!splash.isDestroyed()) splash.destroy();
            if (!backdrop.isDestroyed()) backdrop.destroy();
          }
        }, 200 / fadeSteps);
      }
    }, duration / steps);
  });

  // Intercept Cmd+W so it closes the active tab/pane instead of the window
  // Intercept Cmd+T to open the new-tab picker
  win.webContents.on('before-input-event', (event, input) => {
    if ((input.meta || input.control) && input.type === 'keyDown') {
      if (input.key.toLowerCase() === 'w') {
        event.preventDefault();
        win.webContents.send('close-active-tab');
      } else if (input.key.toLowerCase() === 't') {
        event.preventDefault();
        win.webContents.send('open-tab-picker');
      }
    }
  });

  win.loadFile('index.html');
}

app.whenReady().then(async () => {
  await migrateData(app);
  await ensureBuiltinSpecialists();
  createWindow();

  const deps = { ipcMain, BrowserWindow, dialog, shell, app };
  require('./projects').register(deps);
  require('./skills').register(deps);
  require('./specialists').register(deps);
  require('./todo').register(deps);
  require('./pty').register(deps);
  require('./files').register(deps);
  require('./git-read').register(deps);
  require('./git-ops').register(deps);
  require('./git-worktree').register(deps);
  require('./github').register(deps);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  for (const proc of ptyProcesses.values()) proc.kill();
  ptyProcesses.clear();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
