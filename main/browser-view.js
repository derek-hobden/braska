// Browser tab WebContentsView management
// Replaces deprecated <webview> tag with main-process WebContentsView

const { WebContentsView } = require('electron');

const browserViews = new Map();

function register({ ipcMain, app, BrowserWindow, shell }) {
  ipcMain.handle('browser:create', (event, id) => {
    const view = new WebContentsView({
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    browserViews.set(id, view);

    view.setBackgroundColor('#1e1e1e');

    // Redirect popups to system browser instead of spawning Electron windows
    view.webContents.setWindowOpenHandler(({ url }) => {
      try {
        const parsed = new URL(url);
        if (['http:', 'https:'].includes(parsed.protocol)) {
          shell.openExternal(url);
        }
      } catch { /* invalid URL */ }
      return { action: 'deny' };
    });

    const win = BrowserWindow.fromWebContents(event.sender);
    const send = (channel, ...args) => {
      if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
    };

    view.webContents.on('did-navigate', (_ev, url) => send('browser:did-navigate', id, url));
    view.webContents.on('did-navigate-in-page', (_ev, url) => send('browser:did-navigate', id, url));
    view.webContents.on('page-title-updated', (_ev, title) => send('browser:page-title-updated', id, title));

    // Mirror keyboard shortcuts from main window so Cmd+W/T/R work while view is focused
    view.webContents.on('before-input-event', (ev, input) => {
      if ((input.meta || input.control) && input.type === 'keyDown') {
        const key = input.key.toLowerCase();
        if (key === 'w') { ev.preventDefault(); send('close-active-tab'); }
        else if (key === 't') { ev.preventDefault(); send('open-tab-picker'); }
        else if (input.shift && key === 'r') { ev.preventDefault(); app.relaunch(); app.quit(); }
        else if (key === 'r') { ev.preventDefault(); send('rename-active-tab'); }
      }
    });

    return { ok: true };
  });

  ipcMain.on('browser:navigate', (_event, id, url) => {
    const view = browserViews.get(id);
    if (!view) return;
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) return;
      view.webContents.loadURL(url);
    } catch { /* invalid URL, ignore */ }
  });

  ipcMain.on('browser:back', (_event, id) => {
    const view = browserViews.get(id);
    if (view && view.webContents.canGoBack()) view.webContents.goBack();
  });

  ipcMain.on('browser:forward', (_event, id) => {
    const view = browserViews.get(id);
    if (view && view.webContents.canGoForward()) view.webContents.goForward();
  });

  ipcMain.on('browser:reload', (_event, id) => {
    const view = browserViews.get(id);
    if (view) view.webContents.reload();
  });

  ipcMain.on('browser:setBounds', (_event, id, bounds) => {
    const view = browserViews.get(id);
    if (view) view.setBounds(bounds);
  });

  // Atomically hide all browser views and optionally show one.
  // Passing id=null hides all (used when switching to non-browser tabs or during panel resize).
  ipcMain.on('browser:setActive', (event, id, bounds) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;
    for (const view of browserViews.values()) {
      try { win.contentView.removeChildView(view); } catch {}
    }
    if (id != null) {
      const view = browserViews.get(id);
      if (view) {
        win.contentView.addChildView(view);
        if (bounds) view.setBounds(bounds);
      }
    }
  });

  ipcMain.handle('browser:destroy', (event, id) => {
    const view = browserViews.get(id);
    if (!view) return { ok: true };
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
      try { win.contentView.removeChildView(view); } catch {}
    }
    view.webContents.close();
    browserViews.delete(id);
    return { ok: true };
  });

  ipcMain.on('browser:focus', (_event, id) => {
    const view = browserViews.get(id);
    if (view) view.webContents.focus();
  });

  app.on('window-all-closed', () => {
    for (const view of browserViews.values()) {
      view.webContents.close();
    }
    browserViews.clear();
  });
}

module.exports = { register };
