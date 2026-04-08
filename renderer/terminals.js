// Terminal, browser, and editor tab creation

import { tabState } from './state.js';
import { addTabToOrder, renderTabBar, switchTab, getDisplayLabel } from './tabs.js';
import { markTabBusy, clearTabBusy, markTabActivity, busyTabs, busyDebounceTimers, notifDebounceTimers } from './notifications.js';
import { agentDisplayName, stripAnsi } from './utils.js';
import { onCommitterExit } from './post-commit-prompt.js';

// ── Cross-module deps (set via initTerminals) ──────────────────
let refreshRightPanel = null;

// ── Terminal tab creation ──────────────────────────────────────

export async function startTask(agentName, workDir, options = {}) {
  const workDirChanged = tabState.activeWorkDir !== workDir;
  tabState.activeWorkDir = workDir;
  if (workDirChanged) refreshRightPanel(workDir);

  // Show terminal view
  const mainIntro = document.getElementById('main');
  const settingsPanel = document.getElementById('settings-panel');
  const launchpad = document.getElementById('launchpad');
  const terminalView = document.getElementById('terminal-view');
  const terminalContainers = document.getElementById('terminal-containers');

  mainIntro.style.display = 'none';
  settingsPanel.classList.remove('active');
  launchpad.classList.remove('active');
  terminalView.classList.add('active');

  const baseName = agentDisplayName(agentName);
  const label = options.todoNumber ? `#${options.todoNumber} - ${baseName}` : baseName;

  // Create pane
  const pane = document.createElement('div');
  pane.className = 'terminal-pane';
  terminalContainers.appendChild(pane);

  // Load xterm via ESM dynamic import
  const [{ Terminal }, { FitAddon }] = await Promise.all([
    import('../node_modules/@xterm/xterm/lib/xterm.mjs'),
    import('../node_modules/@xterm/addon-fit/lib/addon-fit.mjs'),
  ]);

  const term = new Terminal({
    theme: { background: '#1e1e1e', foreground: '#d4d4d4', cursor: '#d4d4d4', selectionBackground: '#3a3a3a' },
    fontFamily: 'Menlo, Monaco, "Courier New", monospace',
    fontSize: 13,
    cursorBlink: true,
  });
  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.open(pane);

  // Spawn pty — returns tab id
  const dims = fitAddon.proposeDimensions();
  let id;
  try {
    id = await window.pty.spawn(agentName, options.cwd || workDir, dims, options.initialPrompt || null);
  } catch (err) {
    term.dispose();
    pane.remove();
    // Restore launchpad if no other tabs exist for this workDir
    const hasTabs = [...tabState.tabs.values()].some(t => t.workDir === workDir);
    if (!hasTabs) {
      terminalView.classList.remove('active');
      launchpad.classList.add('active');
    }
    console.error('Failed to spawn PTY:', err);
    return;
  }

  const resizeObs = new ResizeObserver(() => {
    if (tabState.activeTabId === id) fitAddon.fit();
  });
  resizeObs.observe(pane);

  tabState.tabs.set(id, { type: 'terminal', term, fitAddon, resizeObs, pane, tabEl: null, label, workDir, agentName, todoNumber: options.todoNumber || null, todoPath: options.todoPath || null });
  addTabToOrder(id, workDir);
  tabState.activeTabId = id;

  // Wire data
  const isClaudeTab = agentName !== '__TERMINAL__';
  window.pty.onData(id, data => {
    term.write(data);
    if (isClaudeTab && tabState.activeTabId !== id) {
      // Agent in background: green busy dot while active, blue when done
      // Filter escape-only data (cursor moves, TUI redraws) — only real content triggers busy
      const meaningful = stripAnsi(data).trim().length;
      if (meaningful > 0) {
        if (!busyTabs.has(id)) markTabBusy(id);
        if (busyDebounceTimers.has(id)) clearTimeout(busyDebounceTimers.get(id));
        busyDebounceTimers.set(id, setTimeout(() => {
          busyDebounceTimers.delete(id);
          const wasBusy = busyTabs.has(id);
          clearTabBusy(id);
          if (wasBusy && tabState.activeTabId !== id) markTabActivity(workDir, id, getDisplayLabel(id), data);
          // Agent went idle — refresh right panel in case it ran git commands
          if (wasBusy && workDir === tabState.activeWorkDir) refreshRightPanel(workDir);
        }, 1000));
      }
    } else if (!isClaudeTab && tabState.activeTabId !== id) {
      // Plain terminal in background: blue notification only
      if (notifDebounceTimers.has(id)) clearTimeout(notifDebounceTimers.get(id));
      notifDebounceTimers.set(id, setTimeout(() => {
        notifDebounceTimers.delete(id);
        if (tabState.activeTabId !== id) markTabActivity(workDir, id, getDisplayLabel(id), data);
      }, 1000));
    }
  });
  window.pty.onExit(id, code => {
    term.write(`\r\n\x1b[90m[Process exited with code ${code}]\x1b[0m\r\n`);
    if (busyTabs.has(id)) clearTabBusy(id);
    if (tabState.activeTabId !== id) markTabActivity(workDir, id, getDisplayLabel(id), `Process exited with code ${code}`);
    if (agentName === 'committer') onCommitterExit(workDir);
    if (workDir === tabState.activeWorkDir) refreshRightPanel(workDir);
  });
  term.onData(data => window.pty.write(id, data));
  term.onResize(({ cols, rows }) => window.pty.resize(id, cols, rows));

  // Drag-and-drop file handling
  const dropOverlay = document.createElement('div');
  dropOverlay.className = 'drop-overlay';
  dropOverlay.textContent = 'Drop files here';
  pane.appendChild(dropOverlay);

  let dragCounter = 0;
  pane.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    pane.classList.add('drag-over');
  });
  pane.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  pane.addEventListener('dragleave', () => {
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      pane.classList.remove('drag-over');
    }
  });
  pane.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter = 0;
    pane.classList.remove('drag-over');

    // File paths extracted by preload via webUtils.getPathForFile (capture phase)
    const paths = window.dragDrop.getLastDroppedPaths();
    if (paths.length === 0) return;

    const isClaudeSession = agentName !== '__TERMINAL__';
    const parts = paths.map(p => {
      // For Claude/agent sessions, prefix with @ so Claude Code attaches the file
      if (isClaudeSession) {
        return p.includes(' ') ? `@"${p}"` : `@${p}`;
      }
      return p.includes(' ') ? `"${p}"` : p;
    });

    if (parts.length > 0) {
      window.pty.write(id, parts.join(' '));
      term.focus();
    }
  });

  // Activate this tab
  renderTabBar();
  switchTab(id);
}

// ── Browser tab creation ───────────────────────────────────────

export function startBrowser(workDir) {
  const workDirChanged = tabState.activeWorkDir !== workDir;
  tabState.activeWorkDir = workDir;
  if (workDirChanged) refreshRightPanel(workDir);

  const mainIntro = document.getElementById('main');
  const settingsPanel = document.getElementById('settings-panel');
  const launchpad = document.getElementById('launchpad');
  const terminalView = document.getElementById('terminal-view');
  const terminalContainers = document.getElementById('terminal-containers');

  mainIntro.style.display = 'none';
  settingsPanel.classList.remove('active');
  launchpad.classList.remove('active');
  terminalView.classList.add('active');

  const id = tabState.nextBrowserTabId--;

  const pane = document.createElement('div');
  pane.className = 'terminal-pane browser-pane';
  terminalContainers.appendChild(pane);

  const nav = document.createElement('div');
  nav.className = 'browser-nav';
  nav.innerHTML = `
    <button class="browser-nav-btn" data-action="back" title="Back">\u2190</button>
    <button class="browser-nav-btn" data-action="forward" title="Forward">\u2192</button>
    <button class="browser-nav-btn" data-action="reload" title="Reload">\u21BB</button>
    <input class="browser-url" type="text" />
  `;
  pane.appendChild(nav);

  const webview = document.createElement('webview');
  webview.setAttribute('src', 'about:blank');
  webview.setAttribute('allowpopups', '');
  pane.appendChild(webview);

  const navInput = nav.querySelector('.browser-url');
  navInput.value = '';

  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('.browser-nav-btn');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'back') webview.goBack();
    else if (action === 'forward') webview.goForward();
    else if (action === 'reload') webview.reload();
  });

  navInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      let val = navInput.value.trim();
      if (val && !val.match(/^https?:\/\//)) val = 'https://' + val;
      webview.loadURL(val);
    }
  });

  webview.addEventListener('did-navigate', (e) => { navInput.value = e.url; });
  webview.addEventListener('did-navigate-in-page', (e) => { navInput.value = e.url; });
  webview.addEventListener('page-title-updated', (e) => {
    const tab = tabState.tabs.get(id);
    if (tab) {
      tab.label = e.title || 'Browser';
      // Only re-render if no custom label (custom label takes precedence)
      if (!tab.customLabel) renderTabBar();
    }
  });

  tabState.tabs.set(id, { type: 'browser', webview, navInput, pane, tabEl: null, label: 'Browser', workDir });
  addTabToOrder(id, workDir);
  tabState.activeTabId = id;
  renderTabBar();
  switchTab(id);
}

// ── File editor tab creation ───────────────────────────────────

export async function openFileEditor(relPath, fileName) {
  // If already open, just switch to it
  for (const [id, tab] of tabState.tabs) {
    if (tab.type === 'editor' && tab.filePath === relPath && tab.workDir === tabState.activeWorkDir) {
      switchTab(id);
      return;
    }
  }

  const editorWorkDir = tabState.activeWorkDir;

  const mainIntro = document.getElementById('main');
  const settingsPanel = document.getElementById('settings-panel');
  const launchpad = document.getElementById('launchpad');
  const terminalView = document.getElementById('terminal-view');
  const terminalContainers = document.getElementById('terminal-containers');

  mainIntro.style.display = 'none';
  settingsPanel.classList.remove('active');
  launchpad.classList.remove('active');
  terminalView.classList.add('active');

  const content = await window.fileEditor.read(editorWorkDir, relPath);
  const id = tabState.nextBrowserTabId--;

  const pane = document.createElement('div');
  pane.className = 'terminal-pane editor-pane';
  terminalContainers.appendChild(pane);

  const toolbar = document.createElement('div');
  toolbar.className = 'editor-toolbar';
  toolbar.innerHTML = `
    <span class="editor-filepath">${fileName}</span>
    <div class="toolbar-spacer"></div>
    <button class="editor-save-btn" title="Save (\u2318S)">Save</button>
  `;
  pane.appendChild(toolbar);

  const textarea = document.createElement('textarea');
  textarea.className = 'editor-textarea';
  textarea.value = content;
  textarea.spellcheck = false;
  pane.appendChild(textarea);

  let savedContent = content;

  const updateDirty = () => {
    const dirty = textarea.value !== savedContent;
    const tab = tabState.tabs.get(id);
    if (tab) {
      tab.dirty = dirty;
      renderTabBar();
    }
  };

  textarea.addEventListener('input', updateDirty);

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      textarea.value = textarea.value.substring(0, start) + '  ' + textarea.value.substring(end);
      textarea.selectionStart = textarea.selectionEnd = start + 2;
      updateDirty();
    }
  });

  const saveFile = async () => {
    await window.fileEditor.save(editorWorkDir, relPath, textarea.value);
    savedContent = textarea.value;
    updateDirty();
  };

  toolbar.querySelector('.editor-save-btn').addEventListener('click', saveFile);

  tabState.tabs.set(id, {
    type: 'editor', pane, tabEl: null, label: fileName,
    workDir: editorWorkDir, filePath: relPath, textarea, saveFile, dirty: false,
  });
  addTabToOrder(id, editorWorkDir);

  tabState.activeTabId = id;
  renderTabBar();
  switchTab(id);
}

// ── Initialization ─────────────────────────────────────────────

export function initTerminals({ refreshRightPanel: _refreshRightPanel }) {
  refreshRightPanel = _refreshRightPanel;
}
