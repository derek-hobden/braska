// File explorer — file tree panel, inline rename/create, context menu, keyboard nav

import { tabState, explorerState } from './state.js';
import { SVG_FOLDER, SVG_FILE, fileIcon } from './utils.js';

// ── DOM refs (queried once at module level) ──
const filetreePanel = document.getElementById('filetree-panel');
const filetreeBody = document.getElementById('filetree-body');
const ftHeaderActions = document.getElementById('ft-header-actions');
const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
const toggleFiletreeBtn = document.getElementById('toggle-filetree-btn');
const ftContextMenu = document.getElementById('ft-context-menu');
const changesPanelWrapper = document.getElementById('changes-panel-wrapper');
const todosBody = document.getElementById('todos-body');
const githubBody = document.getElementById('github-body');

// ── Cross-module deps (injected via initFileExplorer to avoid circular imports) ──
let _openFileEditor;
let _openDiffTab;
let _refreshChanges;
let _startTask;
let _refreshTodos;
let _refreshGitHub;

// ── Helper: access active work dir from tabState ──
function activeWorkDir() { return tabState.activeWorkDir; }

// ── Sidebar toggle ──────────────────────────────────────────────

export function toggleSidebar() {
  explorerState.sidebarVisible = !explorerState.sidebarVisible;
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('collapsed', !explorerState.sidebarVisible);
  toggleSidebarBtn.classList.toggle('active', explorerState.sidebarVisible);
  // Inline styles from resize override the .collapsed CSS — clear them when
  // collapsing, restore from localStorage when expanding.
  if (!explorerState.sidebarVisible) {
    sidebar.style.width = '';
    sidebar.style.minWidth = '';
  } else {
    const saved = localStorage.getItem('sidebar-width');
    if (saved) { sidebar.style.width = saved + 'px'; sidebar.style.minWidth = '180px'; }
  }
}

// ── File tree visibility ────────────────────────────────────────

export function setFiletreeVisible(visible) {
  explorerState.filetreeVisible = visible;
  filetreePanel.classList.toggle('hidden', !explorerState.filetreeVisible);
  document.getElementById('filetree-resize').classList.toggle('hidden', !explorerState.filetreeVisible);
  toggleFiletreeBtn.classList.toggle('active', explorerState.filetreeVisible);
  if (activeWorkDir()) explorerState.workDirExplorerVisible.set(activeWorkDir(), explorerState.filetreeVisible);
  if (explorerState.filetreeVisible && activeWorkDir()) refreshRightPanel(activeWorkDir());
}

export function toggleFiletree() {
  setFiletreeVisible(!explorerState.filetreeVisible);
}

// ── Restore explorer state per-worktree ─────────────────────────

export function restoreExplorerState(workDir) {
  const visible = explorerState.workDirExplorerVisible.has(workDir) ? explorerState.workDirExplorerVisible.get(workDir) : true;
  explorerState.filetreeVisible = visible;
  filetreePanel.classList.toggle('hidden', !explorerState.filetreeVisible);
  document.getElementById('filetree-resize').classList.toggle('hidden', !explorerState.filetreeVisible);
  toggleFiletreeBtn.classList.toggle('active', explorerState.filetreeVisible);
}

// ── Right panel tab switching ───────────────────────────────────

export function switchRightPanelTab(panel) {
  document.querySelectorAll('.filetree-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.panel === panel)
  );
  filetreeBody.style.display = panel === 'explorer' ? '' : 'none';
  changesPanelWrapper.style.display = panel === 'changes' ? '' : 'none';
  todosBody.style.display = panel === 'todos' ? '' : 'none';
  githubBody.style.display = panel === 'github' ? '' : 'none';
  if (panel === 'changes' && activeWorkDir()) _refreshChanges?.(activeWorkDir());
  if (panel === 'explorer' && activeWorkDir()) refreshFileTree(activeWorkDir());
  if (panel === 'todos' && activeWorkDir()) {
    window.todos.init(activeWorkDir()).then(() => refreshTodos(activeWorkDir()));
  }
  if (panel === 'github' && activeWorkDir()) refreshGitHub(activeWorkDir());
}

// refreshRightPanel dispatches to the correct panel refresh
function refreshRightPanel(workDir) {
  if (!explorerState.filetreeVisible || !workDir) return;
  const activePanel = document.querySelector('.filetree-tab.active')?.dataset.panel;
  if (activePanel === 'changes') _refreshChanges?.(workDir);
  else if (activePanel === 'todos') refreshTodos(workDir);
  else if (activePanel === 'github') refreshGitHub(workDir);
  else refreshFileTree(workDir);
}

// Thin wrappers — these functions live in other modules but are called
// from switchRightPanelTab / refreshRightPanel. They are resolved lazily
// so that this module has no hard import-time dependency on todos or github.
function refreshTodos(workDir) {
  _refreshTodos?.(workDir);
}

function refreshGitHub(workDir) {
  _refreshGitHub?.(workDir);
}

// ── File tree rendering ─────────────────────────────────────────

function clearFileTreeKeepActions() {
  while (filetreeBody.lastChild && filetreeBody.lastChild !== ftHeaderActions) {
    filetreeBody.removeChild(filetreeBody.lastChild);
  }
}

export async function refreshFileTree(workDir) {
  if (!workDir) {
    clearFileTreeKeepActions();
    const empty = document.createElement('div');
    empty.className = 'ft-empty';
    empty.textContent = 'No project selected';
    filetreeBody.appendChild(empty);
    return;
  }
  clearFileTreeKeepActions();
  await renderFileTreeLevel(workDir, '', filetreeBody, 0);
}

async function renderFileTreeLevel(workDir, relDir, container, depth) {
  const entries = await window.filetree.list(workDir, relDir);
  if (entries.length === 0 && depth === 0) {
    container.innerHTML = '<div class="ft-empty">Empty directory</div>';
    return;
  }
  for (const entry of entries) {
    const safeName = entry.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const entryEl = document.createElement('div');
    entryEl.className = 'ft-entry';
    const itemEl = document.createElement('div');
    itemEl.style.paddingLeft = (8 + depth * 16) + 'px';

    if (entry.isDirectory) {
      itemEl.className = 'ft-item ft-dir';
      entryEl.dataset.path = entry.path;
      itemEl.innerHTML = `<span class="ft-icon" style="color:#e8c882">${SVG_FOLDER}</span><span class="ft-name">${safeName}</span>`;
      const childrenEl = document.createElement('div');
      childrenEl.className = 'ft-children';
      let loaded = false;
      itemEl.addEventListener('click', async () => {
        ftFocusItem(entryEl);
        const expanding = entryEl.classList.toggle('expanded');
        if (expanding && !loaded) {
          loaded = true;
          await renderFileTreeLevel(workDir, entry.path, childrenEl, depth + 1);
        }
      });
      // Drag-drop: accept files dropped onto directories
      entryEl.addEventListener('dragover', (e) => {
        e.preventDefault(); e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
        entryEl.classList.add('ft-drop-target');
      });
      entryEl.addEventListener('dragleave', (e) => {
        if (!entryEl.contains(e.relatedTarget)) entryEl.classList.remove('ft-drop-target');
      });
      entryEl.addEventListener('drop', async (e) => {
        e.preventDefault(); e.stopPropagation();
        entryEl.classList.remove('ft-drop-target');
        if (!activeWorkDir()) return;
        const paths = window.dragDrop.getLastDroppedPaths();
        if (paths.length) await window.fileOps.copyIn(activeWorkDir(), entry.path, paths);
      });
      entryEl.appendChild(itemEl);
      entryEl.appendChild(childrenEl);
    } else {
      itemEl.className = 'ft-item ft-file';
      entryEl.dataset.path = entry.path;
      const fi = fileIcon(entry.name);
      itemEl.innerHTML = `<span class="ft-icon" style="color:${fi.color}">${fi.svg}</span><span class="ft-name">${safeName}</span>`;
      itemEl.addEventListener('click', () => { ftFocusItem(entryEl); _openFileEditor(entry.path, entry.name); });
      entryEl.appendChild(itemEl);
    }
    // Right-click context menu for all entries
    entryEl.addEventListener('contextmenu', (e) => {
      e.preventDefault(); e.stopPropagation();
      ftFocusItem(entryEl);
      explorerState.ftCtxTarget = entryEl;
      explorerState.ftCtxIsDir = entry.isDirectory;
      showFtContextMenu(e.clientX, e.clientY);
    });
    container.appendChild(entryEl);
  }
  updateFileTreeHighlights();
}

// ── File tree highlights ────────────────────────────────────────

export function updateFileTreeHighlights() {
  document.querySelectorAll('.ft-entry.open').forEach(el => el.classList.remove('open'));
  document.querySelectorAll('.ft-entry.active-file').forEach(el => el.classList.remove('active-file'));
  const openPaths = new Set();
  let activePath = null;
  const activeTab = tabState.activeTabId != null ? tabState.tabs.get(tabState.activeTabId) : null;
  if (activeTab && activeTab.type === 'editor' && activeTab.workDir === activeWorkDir()) {
    activePath = activeTab.filePath;
  }
  for (const [, tab] of tabState.tabs) {
    if (tab.type === 'editor' && tab.workDir === activeWorkDir()) {
      openPaths.add(tab.filePath);
    }
  }
  if (openPaths.size === 0) return;
  document.querySelectorAll('.ft-entry[data-path]').forEach(el => {
    if (openPaths.has(el.dataset.path)) {
      const isActive = el.dataset.path === activePath;
      // Mark the file itself
      el.classList.add(isActive ? 'active-file' : 'open');
      // Mark all parent directories
      let node = el.parentElement?.closest('.ft-entry');
      while (node) {
        if (node.classList.contains('ft-entry')) {
          // Active wins over open
          if (isActive && !node.classList.contains('active-file')) {
            node.classList.remove('open');
            node.classList.add('active-file');
          } else if (!node.classList.contains('active-file')) {
            node.classList.add('open');
          }
        }
        node = node.parentElement?.closest('.ft-entry');
      }
    }
  });
}

// ── Focus helper ────────────────────────────────────────────────

function ftFocusItem(entryEl) {
  if (explorerState.ftFocusedEl) explorerState.ftFocusedEl.classList.remove('ft-focused');
  explorerState.ftFocusedEl = entryEl;
  if (entryEl) {
    entryEl.classList.add('ft-focused');
    entryEl.querySelector('.ft-item')?.scrollIntoView({ block: 'nearest' });
  }
}

// ── Pyrefly particle animations ─────────────────────────────────

function spawnPyreflies(rect, color, direction) {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  for (let i = 0; i < 10; i++) {
    const el = document.createElement('div');
    el.className = `ft-pyrefly ${direction}`;
    const angle = (i / 10) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
    const dist = 18 + Math.random() * 38;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - (direction === 'out' ? 12 : 0);
    el.style.cssText = `left:${cx}px;top:${cy}px;color:${color};--dx:${dx}px;--dy:${dy}px;`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 650);
  }
}

// ── Inline rename ───────────────────────────────────────────────

function startInlineRename(entryEl) {
  const itemEl = entryEl.querySelector(':scope > .ft-item');
  const nameEl = itemEl?.querySelector('.ft-name');
  if (!nameEl || !entryEl.dataset.path) return;
  const originalName = nameEl.textContent;
  const relPath = entryEl.dataset.path;

  const input = document.createElement('input');
  input.className = 'ft-rename-input';
  input.type = 'text';
  input.value = originalName;
  nameEl.replaceWith(input);

  // Select name without extension for files
  const isFile = !!itemEl.classList.contains('ft-file');
  const dotIdx = originalName.lastIndexOf('.');
  if (isFile && dotIdx > 0) input.setSelectionRange(0, dotIdx);
  else input.select();
  input.focus();

  let committed = false;
  const commit = async () => {
    if (committed) return;
    committed = true;
    const newName = input.value.trim();
    if (!newName || newName === originalName) { input.replaceWith(nameEl); return; }
    const result = await window.fileOps.rename(activeWorkDir(), relPath, newName);
    if (!result?.ok) input.replaceWith(nameEl);
    // On success the watcher rebuilds the tree
  };
  input.addEventListener('keydown', async (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); await commit(); }
    else if (e.key === 'Escape') { committed = true; input.replaceWith(nameEl); }
  });
  input.addEventListener('blur', commit);
}

// ── Inline create (new file / new folder) ───────────────────────

async function startInlineCreate(targetEntryEl, isDir) {
  let dirRelPath = '';
  let depth = 0;
  let container;

  if (targetEntryEl) {
    // If given a file, use its parent directory entry
    let dirEl = targetEntryEl;
    if (!dirEl.querySelector(':scope > .ft-item.ft-dir')) {
      dirEl = dirEl.parentElement?.closest('.ft-entry') || null;
    }
    if (dirEl) {
      dirRelPath = dirEl.dataset.path || '';
      depth = dirRelPath ? dirRelPath.split('/').length : 0;
      container = dirEl.querySelector(':scope > .ft-children');
      dirEl.classList.add('expanded');
    }
  }
  if (!container) { container = filetreeBody; depth = 0; }

  const tempEntry = document.createElement('div');
  tempEntry.className = 'ft-entry';
  const tempItem = document.createElement('div');
  tempItem.className = `ft-item ${isDir ? 'ft-dir' : 'ft-file'}`;
  tempItem.style.paddingLeft = (8 + depth * 16) + 'px';
  tempItem.innerHTML = `<span class="ft-icon" style="color:${isDir ? '#e8c882' : '#888'}">${isDir ? SVG_FOLDER : SVG_FILE}</span>`;
  const input = document.createElement('input');
  input.className = 'ft-rename-input';
  input.type = 'text';
  input.placeholder = isDir ? 'folder-name' : 'file-name';
  tempItem.appendChild(input);
  tempEntry.appendChild(tempItem);
  container.insertBefore(tempEntry, container.firstChild);
  input.focus();

  let committed = false;
  const commit = async () => {
    if (committed) return;
    committed = true;
    const name = input.value.trim();
    tempEntry.remove();
    if (!name || !activeWorkDir()) return;
    const result = isDir
      ? await window.fileOps.createDir(activeWorkDir(), dirRelPath, name)
      : await window.fileOps.createFile(activeWorkDir(), dirRelPath, name);
    if (result?.ok) {
      const newRelPath = (dirRelPath ? dirRelPath + '/' : '') + name;
      setTimeout(() => {
        const newEl = filetreeBody.querySelector(`.ft-entry[data-path="${CSS.escape(newRelPath)}"]`);
        if (newEl) {
          const color = isDir ? '#e8c882' : fileIcon(name).color;
          spawnPyreflies(newEl.querySelector('.ft-item').getBoundingClientRect(), color, 'in');
          ftFocusItem(newEl);
        }
      }, 400);
    }
  };
  input.addEventListener('keydown', async (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { e.preventDefault(); await commit(); }
    else if (e.key === 'Escape') { committed = true; tempEntry.remove(); }
  });
  input.addEventListener('blur', commit);
}

// ── Context menu ────────────────────────────────────────────────

function showFtContextMenu(x, y) {
  ftContextMenu.style.left = x + 'px';
  ftContextMenu.style.top = y + 'px';
  ftContextMenu.classList.add('active');
  requestAnimationFrame(() => {
    const rect = ftContextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) ftContextMenu.style.left = (x - rect.width) + 'px';
    if (rect.bottom > window.innerHeight) ftContextMenu.style.top = (y - rect.height) + 'px';
  });
}

// ── Keyboard navigation helper ──────────────────────────────────

function getVisibleFtEntries() {
  return Array.from(filetreeBody.querySelectorAll('.ft-entry')).filter(el => {
    let node = el.parentElement;
    while (node && node !== filetreeBody) {
      if (node.classList.contains('ft-children') && getComputedStyle(node).display === 'none') return false;
      node = node.parentElement;
    }
    return true;
  });
}

// ── Resizable panels (IIFE) ────────────────────────────────────

function initResizablePanels() {
  const sidebar = document.getElementById('sidebar');
  const sidebarHandle = document.getElementById('sidebar-resize');
  const filetreeHandle = document.getElementById('filetree-resize');
  const MIN_SIDEBAR = 180;
  const MIN_FILETREE = 180;

  // Restore persisted widths
  const savedSidebarW = localStorage.getItem('sidebar-width');
  const savedFiletreeW = localStorage.getItem('filetree-width');
  if (savedSidebarW) { sidebar.style.width = savedSidebarW + 'px'; sidebar.style.minWidth = MIN_SIDEBAR + 'px'; }
  if (savedFiletreeW) { filetreePanel.style.width = savedFiletreeW + 'px'; }

  function startDrag(e, getTarget, min, storageKey, getWidth) {
    e.preventDefault();
    const handle = e.currentTarget;
    handle.classList.add('dragging');
    document.body.classList.add('resizing');
    const startX = e.clientX;
    const startWidth = getWidth();

    function onMove(ev) {
      const delta = storageKey === 'sidebar-width'
        ? ev.clientX - startX
        : startX - ev.clientX;
      const newWidth = Math.max(min, startWidth + delta);
      getTarget().style.width = newWidth + 'px';
    }

    function onUp() {
      handle.classList.remove('dragging');
      document.body.classList.remove('resizing');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const finalWidth = parseInt(getTarget().style.width);
      if (finalWidth) localStorage.setItem(storageKey, finalWidth);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  sidebarHandle.addEventListener('mousedown', (e) => {
    startDrag(e, () => sidebar, MIN_SIDEBAR, 'sidebar-width', () => sidebar.getBoundingClientRect().width);
  });

  filetreeHandle.addEventListener('mousedown', (e) => {
    startDrag(e, () => filetreePanel, MIN_FILETREE, 'filetree-width', () => filetreePanel.getBoundingClientRect().width);
  });
}

// ── Init: wire up all event listeners ───────────────────────────

export function initFileExplorer({ openFileEditor, openDiffTab, refreshChanges, startTask, refreshTodos: injectedRefreshTodos, refreshGitHub: injectedRefreshGitHub }) {
  _openFileEditor = openFileEditor;
  _openDiffTab = openDiffTab;
  _refreshChanges = refreshChanges;
  _startTask = startTask;
  _refreshTodos = injectedRefreshTodos;
  _refreshGitHub = injectedRefreshGitHub;

  // Sidebar / filetree toggle buttons
  toggleSidebarBtn.addEventListener('click', toggleSidebar);
  toggleFiletreeBtn.addEventListener('click', toggleFiletree);

  // Filetree header tab buttons (Explorer, Git, Todos, GitHub)
  document.getElementById('filetree-header').addEventListener('click', (e) => {
    const tab = e.target.closest('.filetree-tab');
    if (tab) switchRightPanelTab(tab.dataset.panel);
  });

  // Header new file/folder buttons
  document.getElementById('ft-new-file-btn').addEventListener('click', () => {
    if (!activeWorkDir()) return;
    startInlineCreate(explorerState.ftFocusedEl, false);
  });
  document.getElementById('ft-new-folder-btn').addEventListener('click', () => {
    if (!activeWorkDir()) return;
    startInlineCreate(explorerState.ftFocusedEl, true);
  });

  // Context menu item actions
  ftContextMenu.addEventListener('click', async (e) => {
    const item = e.target.closest('.wt-ctx-item');
    if (!item || item.classList.contains('disabled')) return;
    ftContextMenu.classList.remove('active');
    const action = item.dataset.action;
    const relPath = explorerState.ftCtxTarget?.dataset.path || '';

    if (action === 'new-file') {
      await startInlineCreate(explorerState.ftCtxTarget, false);
    } else if (action === 'new-folder') {
      await startInlineCreate(explorerState.ftCtxTarget, true);
    } else if (action === 'rename') {
      if (explorerState.ftCtxTarget) startInlineRename(explorerState.ftCtxTarget);
    } else if (action === 'copy-path') {
      if (activeWorkDir()) navigator.clipboard.writeText(activeWorkDir() + '/' + relPath);
    } else if (action === 'reveal') {
      if (relPath && activeWorkDir()) window.fileOps.reveal(activeWorkDir(), relPath);
    } else if (action === 'open-terminal') {
      if (!activeWorkDir()) return;
      let targetDir = activeWorkDir();
      if (relPath) {
        const abs = activeWorkDir() + '/' + relPath;
        targetDir = explorerState.ftCtxIsDir ? abs : abs.substring(0, abs.lastIndexOf('/'));
      }
      _startTask('__TERMINAL__', activeWorkDir(), { cwd: targetDir });
    } else if (action === 'gitignore') {
      if (relPath && activeWorkDir()) window.fileOps.gitignore(activeWorkDir(), relPath);
    } else if (action === 'delete') {
      if (!relPath || !activeWorkDir()) return;
      const name = relPath.split('/').pop();
      if (!confirm(`Delete "${name}"?`)) return;
      const itemEl = explorerState.ftCtxTarget?.querySelector('.ft-item');
      const rect = itemEl?.getBoundingClientRect();
      const color = explorerState.ftCtxIsDir ? '#e8c882' : fileIcon(name).color;
      if (rect) spawnPyreflies(rect, color, 'out');
      await window.fileOps.delete(activeWorkDir(), relPath);
    }
  });

  // filetreeBody: right-click context menu (background = root-level)
  filetreeBody.addEventListener('contextmenu', (e) => {
    if (!activeWorkDir()) return;
    e.preventDefault();
    e.stopPropagation();
    const entry = e.target.closest('.ft-entry');
    explorerState.ftCtxTarget = entry || null;
    explorerState.ftCtxIsDir = entry ? !!entry.querySelector(':scope > .ft-item.ft-dir') : true;
    if (entry) ftFocusItem(entry);
    showFtContextMenu(e.clientX, e.clientY);
  });

  // Close ft context menu on outside click/contextmenu
  document.addEventListener('click', () => ftContextMenu.classList.remove('active'));
  document.addEventListener('contextmenu', () => ftContextMenu.classList.remove('active'));

  // filetreeBody: drag-drop at root level
  filetreeBody.addEventListener('dragover', (e) => {
    if (e.target.closest('.ft-entry')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    filetreeBody.classList.add('ft-drop-root');
  });
  filetreeBody.addEventListener('dragleave', (e) => {
    if (!filetreeBody.contains(e.relatedTarget)) filetreeBody.classList.remove('ft-drop-root');
  });
  filetreeBody.addEventListener('drop', async (e) => {
    if (e.target.closest('.ft-entry')) return;
    e.preventDefault();
    filetreeBody.classList.remove('ft-drop-root');
    if (!activeWorkDir()) return;
    const paths = window.dragDrop.getLastDroppedPaths();
    if (paths.length) await window.fileOps.copyIn(activeWorkDir(), '', paths);
  });

  // Keyboard navigation
  filetreeBody.addEventListener('keydown', async (e) => {
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    const activePanel = document.querySelector('.filetree-tab.active')?.dataset.panel;
    if (activePanel !== 'explorer') return;

    const visible = getVisibleFtEntries();
    if (visible.length === 0) return;
    const idx = explorerState.ftFocusedEl ? visible.indexOf(explorerState.ftFocusedEl) : -1;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      ftFocusItem(visible[idx < 0 ? 0 : Math.min(idx + 1, visible.length - 1)]);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      ftFocusItem(visible[idx <= 0 ? 0 : idx - 1]);
    } else if (e.key === 'ArrowRight') {
      if (!explorerState.ftFocusedEl) return;
      e.preventDefault();
      if (explorerState.ftFocusedEl.querySelector(':scope > .ft-item.ft-dir')) {
        if (!explorerState.ftFocusedEl.classList.contains('expanded')) {
          explorerState.ftFocusedEl.querySelector(':scope > .ft-item').click();
        } else {
          const first = explorerState.ftFocusedEl.querySelector(':scope > .ft-children > .ft-entry');
          if (first) ftFocusItem(first);
        }
      }
    } else if (e.key === 'ArrowLeft') {
      if (!explorerState.ftFocusedEl) return;
      e.preventDefault();
      if (explorerState.ftFocusedEl.classList.contains('expanded')) {
        explorerState.ftFocusedEl.querySelector(':scope > .ft-item').click();
      } else {
        const parent = explorerState.ftFocusedEl.parentElement?.closest('.ft-entry');
        if (parent) ftFocusItem(parent);
      }
    } else if (e.key === 'Enter') {
      if (!explorerState.ftFocusedEl) return;
      e.preventDefault();
      explorerState.ftFocusedEl.querySelector(':scope > .ft-item')?.click();
    } else if (e.key === 'F2') {
      if (!explorerState.ftFocusedEl) return;
      e.preventDefault();
      startInlineRename(explorerState.ftFocusedEl);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (!explorerState.ftFocusedEl || !activeWorkDir()) return;
      const relPath = explorerState.ftFocusedEl.dataset.path;
      if (!relPath) return;
      const name = relPath.split('/').pop();
      if (!confirm(`Delete "${name}"?`)) return;
      e.preventDefault();
      const isDir = !!explorerState.ftFocusedEl.querySelector(':scope > .ft-item.ft-dir');
      const color = isDir ? '#e8c882' : fileIcon(name).color;
      const rect = explorerState.ftFocusedEl.querySelector('.ft-item')?.getBoundingClientRect();
      if (rect) spawnPyreflies(rect, color, 'out');
      explorerState.ftFocusedEl = null;
      await window.fileOps.delete(activeWorkDir(), relPath);
    } else if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
      // Clipboard paste — only acts on file:// URIs (won't intercept text paste)
      if (!activeWorkDir()) return;
      try {
        const items = await navigator.clipboard.read();
        const paths = [];
        for (const item of items) {
          if (item.types.includes('text/uri-list')) {
            const blob = await item.getType('text/uri-list');
            const text = await blob.text();
            for (const line of text.split('\n')) {
              const u = line.trim();
              if (u.startsWith('file://')) {
                try { paths.push(decodeURIComponent(new URL(u).pathname)); } catch {}
              }
            }
          }
        }
        if (paths.length > 0) {
          e.preventDefault();
          const dirEl = explorerState.ftFocusedEl?.querySelector(':scope > .ft-item.ft-dir')
            ? explorerState.ftFocusedEl
            : explorerState.ftFocusedEl?.parentElement?.closest('.ft-entry') || null;
          const targetRelDir = dirEl?.dataset.path || '';
          await window.fileOps.copyIn(activeWorkDir(), targetRelDir, paths);
        }
      } catch {}
    }
  });

  // Global keyboard shortcuts for panel toggles
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
      e.preventDefault();
      toggleSidebar();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'e') {
      e.preventDefault();
      toggleFiletree();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
      e.preventDefault();
      if (!explorerState.filetreeVisible) {
        toggleFiletree();
        switchRightPanelTab('changes');
      } else if (document.querySelector('.filetree-tab[data-panel="changes"]')?.classList.contains('active')) {
        toggleFiletree();
      } else {
        switchRightPanelTab('changes');
      }
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
      e.preventDefault();
      if (!explorerState.filetreeVisible) {
        toggleFiletree();
        switchRightPanelTab('todos');
      } else if (document.querySelector('.filetree-tab[data-panel="todos"]')?.classList.contains('active')) {
        toggleFiletree();
      } else {
        switchRightPanelTab('todos');
      }
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'g') {
      e.preventDefault();
      if (!explorerState.filetreeVisible) {
        toggleFiletree();
        switchRightPanelTab('github');
      } else if (document.querySelector('.filetree-tab[data-panel="github"]')?.classList.contains('active')) {
        toggleFiletree();
      } else {
        switchRightPanelTab('github');
      }
    }
  });

  // Initialize resizable panels
  initResizablePanels();
}
