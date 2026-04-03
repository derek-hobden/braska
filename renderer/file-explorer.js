// File explorer — file tree panel, rendering, panel switching, resize

import { tabState, explorerState } from './state.js';
import { SVG_FOLDER, SVG_FILE, fileIcon } from './utils.js';
import { initFileExplorerOps, startInlineCreate } from './file-explorer-ops.js';

// ── DOM refs (queried once at module level) ──
const filetreePanel = document.getElementById('filetree-panel');
const filetreeBody = document.getElementById('filetree-body');
const ftHeaderActions = document.getElementById('ft-header-actions');
const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
const toggleFiletreeBtn = document.getElementById('toggle-filetree-btn');
const ftContextMenu = document.getElementById('ft-context-menu');
const changesPanelWrapper = document.getElementById('changes-panel-wrapper');
const todoBody = document.getElementById('todo-body');
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
  todoBody.style.display = panel === 'todo' ? '' : 'none';
  githubBody.style.display = panel === 'github' ? '' : 'none';
  if (panel === 'changes' && activeWorkDir()) _refreshChanges?.(activeWorkDir());
  if (panel === 'explorer' && activeWorkDir()) refreshFileTree(activeWorkDir());
  if (panel === 'todo' && activeWorkDir()) {
    window.todo.init(activeWorkDir()).then(() => refreshTodos(activeWorkDir())).catch(err => console.error('[Braska]', err));
  }
  if (panel === 'github' && activeWorkDir()) refreshGitHub(activeWorkDir());
}

// refreshRightPanel dispatches to the correct panel refresh
function refreshRightPanel(workDir) {
  if (!explorerState.filetreeVisible || !workDir) return;
  const activePanel = document.querySelector('.filetree-tab.active')?.dataset.panel;
  if (activePanel === 'changes') _refreshChanges?.(workDir);
  else if (activePanel === 'todo') refreshTodos(workDir);
  else if (activePanel === 'github') refreshGitHub(workDir);
  else refreshFileTree(workDir);
}

// Thin wrappers — resolved lazily so this module has no hard dependency on todos/github
function refreshTodos(workDir) { _refreshTodos?.(workDir); }
function refreshGitHub(workDir) { _refreshGitHub?.(workDir); }

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
      ftContextMenu.style.left = e.clientX + 'px';
      ftContextMenu.style.top = e.clientY + 'px';
      ftContextMenu.classList.add('active');
      requestAnimationFrame(() => {
        const rect = ftContextMenu.getBoundingClientRect();
        if (rect.right > window.innerWidth) ftContextMenu.style.left = (e.clientX - rect.width) + 'px';
        if (rect.bottom > window.innerHeight) ftContextMenu.style.top = (e.clientY - rect.height) + 'px';
      });
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
      el.classList.add(isActive ? 'active-file' : 'open');
      let node = el.parentElement?.closest('.ft-entry');
      while (node) {
        if (node.classList.contains('ft-entry')) {
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

// ── Resizable panels ────────────────────────────────────────────

function initResizablePanels() {
  const sidebar = document.getElementById('sidebar');
  const sidebarHandle = document.getElementById('sidebar-resize');
  const filetreeHandle = document.getElementById('filetree-resize');
  const MIN_SIDEBAR = 180;
  const MIN_FILETREE = 180;

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

  // Initialize operations sub-module (context menu, keyboard, drag-drop)
  initFileExplorerOps({
    activeWorkDir,
    filetreeBody,
    ftContextMenu,
    refreshFileTree,
    ftFocusItem,
    startTask,
    switchRightPanelTab: { toggleSidebar, toggleFiletree, switchRightPanelTab },
  });

  // Initialize resizable panels
  initResizablePanels();
}
