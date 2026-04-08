// Tab management — ordering, rendering, switching, closing

import { tabState } from './state.js';
import { clearNotifForTab, clearTabBusy, busyTabs, notifLog } from './notifications.js';
import { escHtml } from './utils.js';

// ── Cross-module deps (set via initTabs) ───────────────────────
let showTabTypePicker = null;
let updateFileTreeHighlights = null;
let showTodoClosePrompt = null;
let refreshTodos = null;
let updateTodoFocus = null;
let refreshRightPanel = null;

// ── Display label helper ──────────────────────────────────────
export function getDisplayLabel(id) {
  const tab = tabState.tabs.get(id);
  if (!tab) return '';
  return tab.customLabel || tab.label;
}

// ── Tab ordering helpers ───────────────────────────────────────

export function addTabToOrder(id, wd) {
  if (!tabState.tabOrder.has(wd)) tabState.tabOrder.set(wd, []);
  const order = tabState.tabOrder.get(wd);
  if (!order.includes(id)) order.push(id);
}

export function removeTabFromOrder(id, wd) {
  const order = tabState.tabOrder.get(wd);
  if (order) {
    const idx = order.indexOf(id);
    if (idx !== -1) order.splice(idx, 1);
  }
}

export function tabsForWorkDir(wd) {
  const order = tabState.tabOrder.get(wd);
  if (order) {
    return order.filter(id => tabState.tabs.has(id)).map(id => [id, tabState.tabs.get(id)]);
  }
  return [...tabState.tabs.entries()].filter(([, t]) => t.workDir === wd);
}

// ── Tab bar rendering ──────────────────────────────────────────

export function renderTabBar() {
  const terminalHeader = document.getElementById('terminal-header');
  terminalHeader.innerHTML = '';
  const workDirTabs = tabsForWorkDir(tabState.activeWorkDir);
  for (const [id, tab] of workDirTabs) {
    const el = document.createElement('div');
    const isBusy = busyTabs.has(id);
    const hasNotif = !isBusy && notifLog.some(n => n.tabId === id && !n.seen);
    el.className = 'term-tab' + (id === tabState.activeTabId ? ' active' : '') + (isBusy ? ' is-busy' : '') + (hasNotif ? ' has-notification' : '');
    el.dataset.id = id;
    if (tab.todoNumber) el.dataset.todoNum = tab.todoNumber;
    el.draggable = true;
    const baseLabel = tab.customLabel || tab.label;
    const displayLabel = escHtml((tab.dirty ? '\u25CF ' : '') + baseLabel);
    el.innerHTML = `<span class="term-tab-label">${displayLabel}</span><button class="term-tab-close" data-id="${id}" title="Close tab">&times;</button>`;
    el.addEventListener('click', (e) => {
      if (!e.target.closest('.term-tab-close')) switchTab(id);
    });
    el.addEventListener('dblclick', (e) => {
      if (!e.target.closest('.term-tab-close')) startTabRename(id);
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showTabContextMenu(id, e.clientX, e.clientY);
    });
    el.querySelector('.term-tab-close').addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(id);
    });
    el.addEventListener('dragstart', (e) => {
      tabState.dragTabId = id;
      el.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    el.addEventListener('dragend', () => {
      tabState.dragTabId = null;
      el.classList.remove('dragging');
      terminalHeader.querySelectorAll('.drag-over-left, .drag-over-right').forEach(
        el => el.classList.remove('drag-over-left', 'drag-over-right')
      );
    });
    el.addEventListener('dragover', (e) => {
      if (tabState.dragTabId === null || tabState.dragTabId === id) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = el.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      const isLeft = e.clientX < midX;
      el.classList.toggle('drag-over-left', isLeft);
      el.classList.toggle('drag-over-right', !isLeft);
    });
    el.addEventListener('dragleave', () => {
      el.classList.remove('drag-over-left', 'drag-over-right');
    });
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('drag-over-left', 'drag-over-right');
      if (tabState.dragTabId === null || tabState.dragTabId === id) return;
      const order = tabState.tabOrder.get(tabState.activeWorkDir);
      if (!order) return;
      const fromIdx = order.indexOf(tabState.dragTabId);
      if (fromIdx === -1) return;
      order.splice(fromIdx, 1);
      let toIdx = order.indexOf(id);
      const rect = el.getBoundingClientRect();
      if (e.clientX >= rect.left + rect.width / 2) toIdx++;
      order.splice(toIdx, 0, tabState.dragTabId);
      renderTabBar();
      switchTab(tabState.activeTabId);
    });
    terminalHeader.appendChild(el);
    tab.tabEl = el;
  }
  // "+" button to add another tab to this worktree
  const addEl = document.createElement('div');
  addEl.className = 'term-tab';
  addEl.style.cssText = 'color:#555;padding:8px 10px;';
  addEl.innerHTML = '+';
  addEl.title = 'Add tab';
  addEl.addEventListener('click', () => showTabTypePicker(tabState.activeWorkDir));
  terminalHeader.appendChild(addEl);
}

// ── Tab renaming ──────────────────────────────────────────────

export function startTabRename(id) {
  const tab = tabState.tabs.get(id);
  if (!tab || !tab.tabEl) return;
  const labelSpan = tab.tabEl.querySelector('.term-tab-label');
  if (!labelSpan) return;

  const input = document.createElement('input');
  input.className = 'term-tab-rename-input';
  input.value = tab.customLabel || tab.label;

  // Prevent tab drag while renaming
  tab.tabEl.draggable = false;

  let cancelled = false;
  const focusTabContent = () => {
    if (tab.type === 'browser') tab.webview.focus();
    else if (tab.type === 'editor') tab.textarea.focus();
    else if (tab.type === 'terminal') tab.term.focus();
  };
  const commit = () => {
    if (cancelled) return;
    const val = input.value.trim();
    if (val && val !== tab.label) {
      tab.customLabel = val;
    } else if (!val || val === tab.label) {
      delete tab.customLabel;
    }
    tab.tabEl.draggable = true;
    renderTabBar();
    focusTabContent();
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelled = true;
      tab.tabEl.draggable = true;
      renderTabBar();
      focusTabContent();
    }
    e.stopPropagation();
  });
  input.addEventListener('blur', commit);
  // Prevent click from switching tabs while editing
  input.addEventListener('click', (e) => e.stopPropagation());
  input.addEventListener('dblclick', (e) => e.stopPropagation());

  labelSpan.replaceWith(input);
  input.focus();
  input.select();
}

// ── Tab context menu ──────────────────────────────────────────

let tabCtxTargetId = null;

function showTabContextMenu(id, x, y) {
  tabCtxTargetId = id;
  const menu = document.getElementById('tab-context-menu');
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.classList.add('active');
  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (x - rect.width) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (y - rect.height) + 'px';
  });
}

function hideTabContextMenu() {
  document.getElementById('tab-context-menu').classList.remove('active');
  tabCtxTargetId = null;
}

// ── Tab switching ──────────────────────────────────────────────

export function switchTab(id) {
  if (!tabState.tabs.has(id)) return;
  const prevWorkDir = tabState.activeWorkDir;
  tabState.activeTabId = id;
  clearNotifForTab(id);
  if (busyTabs.has(id)) clearTabBusy(id);
  // Show/hide panes: only show panes for current workDir, and only active one visible
  for (const [tid, tab] of tabState.tabs) {
    const show = tab.workDir === tabState.activeWorkDir && tid === id;
    tab.pane.classList.toggle('active', show);
    if (tab.tabEl) tab.tabEl.classList.toggle('active', tid === id);
  }
  const tab = tabState.tabs.get(id);
  if (tab.type === 'browser') {
    tab.webview.focus();
  } else if (tab.type === 'editor') {
    tab.textarea.focus();
  } else if (tab.type === 'terminal') {
    tab.fitAddon.fit();
    tab.term.focus();
  }
  updateFileTreeHighlights();
  if (updateTodoFocus) updateTodoFocus();
  if (refreshRightPanel && tabState.activeWorkDir !== prevWorkDir) refreshRightPanel(tabState.activeWorkDir);
}

// ── Tab closing ────────────────────────────────────────────────

export async function closeTab(id) {
  const tab = tabState.tabs.get(id);
  if (!tab) return;

  // Prompt user when closing a tab that's working on an open todo
  if (tab.todoNumber && tab.todoPath && tab.todoPath.startsWith('open/') && showTodoClosePrompt) {
    const choice = await showTodoClosePrompt(tab.todoNumber);
    if (choice === 'cancel') return;
    if (choice === 'done') {
      try {
        await window.todo.close(tab.workDir, tab.todoPath, 'done');
      } catch (err) {
        console.error('[Braska] Failed to close todo on tab close:', err);
      }
      if (refreshTodos) refreshTodos(tabState.activeWorkDir);
    }
  }

  clearNotifForTab(id);
  if (busyTabs.has(id)) clearTabBusy(id);
  const closedWorkDir = tab.workDir;
  if (tab.type === 'browser' || tab.type === 'editor' || tab.type === 'diff') {
    // Nothing extra to clean up — just remove the pane
  } else {
    tab.term.dispose();
    if (tab.resizeObs) tab.resizeObs.disconnect();
    window.pty.removeListeners(id);
    await window.pty.kill(id);
  }
  tab.pane.remove();
  removeTabFromOrder(id, closedWorkDir);
  tabState.tabs.delete(id);

  const terminalView = document.getElementById('terminal-view');
  const settingsPanel = document.getElementById('settings-panel');
  const launchpad = document.getElementById('launchpad');

  const remaining = tabsForWorkDir(closedWorkDir);
  if (remaining.length === 0 && closedWorkDir === tabState.activeWorkDir) {
    // No tabs left for this worktree — show launchpad
    tabState.activeTabId = null;
    terminalView.classList.remove('active');
    settingsPanel.classList.remove('active');
    launchpad.classList.add('active');
  } else if (tabState.activeTabId === id) {
    // Switch to another tab in same worktree
    const nextId = remaining.length > 0 ? remaining[remaining.length - 1][0] : null;
    if (nextId) switchTab(nextId);
  }
  renderTabBar();
  updateFileTreeHighlights();
}

// ── Initialization ─────────────────────────────────────────────

export function initTabs({ showTabTypePicker: _showTabTypePicker, updateFileTreeHighlights: _updateFileTreeHighlights, showTodoClosePrompt: _showTodoClosePrompt, refreshTodos: _refreshTodos, updateTodoFocus: _updateTodoFocus, refreshRightPanel: _refreshRightPanel }) {
  showTabTypePicker = _showTabTypePicker;
  updateFileTreeHighlights = _updateFileTreeHighlights;
  showTodoClosePrompt = _showTodoClosePrompt;
  refreshTodos = _refreshTodos;
  updateTodoFocus = _updateTodoFocus;
  refreshRightPanel = _refreshRightPanel;

  window.windowActions.onCloseActiveTab(() => {
    if (tabState.activeTabId != null) closeTab(tabState.activeTabId);
  });
  window.windowActions.onOpenTabPicker(() => {
    if (tabState.activeWorkDir) showTabTypePicker(tabState.activeWorkDir);
  });
  window.windowActions.onRenameActiveTab(() => {
    if (tabState.activeTabId != null) startTabRename(tabState.activeTabId);
  });

  // Tab context menu actions
  const tabCtxMenu = document.getElementById('tab-context-menu');
  tabCtxMenu.addEventListener('click', (e) => {
    const item = e.target.closest('.wt-ctx-item');
    if (!item || !tabCtxTargetId) return;
    const action = item.dataset.action;
    const id = tabCtxTargetId;
    hideTabContextMenu();
    if (action === 'rename') startTabRename(id);
    else if (action === 'close') closeTab(id);
  });
  document.addEventListener('click', hideTabContextMenu);
  document.addEventListener('contextmenu', hideTabContextMenu);

  // F2 hotkey to rename active tab (capture phase so it fires before xterm)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F2' && tabState.activeTabId != null) {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      e.stopPropagation();
      startTabRename(tabState.activeTabId);
    }
  }, true);
}
