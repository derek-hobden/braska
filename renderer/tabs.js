// Tab management — ordering, rendering, switching, closing

import { tabState } from './state.js';
import { clearNotifForTab, clearTabBusy, busyTabs, notifLog } from './notifications.js';

// ── Cross-module deps (set via initTabs) ───────────────────────
let showTabTypePicker = null;
let updateFileTreeHighlights = null;

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
    el.draggable = true;
    el.innerHTML = `<span class="term-tab-label">${tab.label}</span><button class="term-tab-close" data-id="${id}" title="Close tab">&times;</button>`;
    el.addEventListener('click', (e) => {
      if (!e.target.closest('.term-tab-close')) switchTab(id);
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

// ── Tab switching ──────────────────────────────────────────────

export function switchTab(id) {
  if (!tabState.tabs.has(id)) return;
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
}

// ── Tab closing ────────────────────────────────────────────────

export async function closeTab(id) {
  const tab = tabState.tabs.get(id);
  if (!tab) return;
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

export function initTabs({ showTabTypePicker: _showTabTypePicker, updateFileTreeHighlights: _updateFileTreeHighlights }) {
  showTabTypePicker = _showTabTypePicker;
  updateFileTreeHighlights = _updateFileTreeHighlights;

  window.windowActions.onCloseActiveTab(() => {
    if (tabState.activeTabId != null) closeTab(tabState.activeTabId);
  });
  window.windowActions.onOpenTabPicker(() => {
    if (tabState.activeWorkDir) showTabTypePicker(tabState.activeWorkDir);
  });
}
