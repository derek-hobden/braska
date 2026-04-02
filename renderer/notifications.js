// Notification system — activity dots, busy indicators, bell dropdown

import { tabState } from './state.js';
import { getWorkDirLabel, formatTimeAgo, escHtml, stripAnsi } from './utils.js';

// ── Module-local notification state ──
const notifActivity = new Map();  // workDir → Set of tab IDs with unseen activity
export const notifLog = [];       // { id, workDir, tabId, tabLabel, snippet, timestamp, seen }
let notifNextId = 1;
let notifUpdateTimer = null;

// Exported for PTY data handler (terminals.js) that manages debounce timers directly
export const notifDebounceTimers = new Map();  // tabId → setTimeout handle
export const busyDebounceTimers = new Map();   // tabId → setTimeout handle
export const busyTabs = new Set();             // tab IDs receiving PTY output

// ── Core functions ──────────────────────────────────────────────

export function markTabActivity(workDir, tabId, tabLabel, snippet) {
  if (tabId === tabState.activeTabId) return;
  if (!notifActivity.has(workDir)) notifActivity.set(workDir, new Set());
  notifActivity.get(workDir).add(tabId);

  const cleanSnippet = stripAnsi(snippet).trim();
  if (cleanSnippet) {
    const existing = notifLog.find(n => n.tabId === tabId && !n.seen);
    if (existing) {
      existing.snippet = cleanSnippet.slice(-100);
      existing.timestamp = Date.now();
    } else {
      notifLog.unshift({
        id: notifNextId++, workDir, tabId, tabLabel,
        snippet: cleanSnippet.slice(-100),
        timestamp: Date.now(), seen: false,
      });
      if (notifLog.length > 50) notifLog.length = 50;
    }
  }
  scheduleNotifUpdate();
}

export function scheduleNotifUpdate() {
  if (notifUpdateTimer) return;
  notifUpdateTimer = setTimeout(() => {
    notifUpdateTimer = null;
    updateNotifUI();
  }, 300);
}

export function updateNotifUI() {
  function wdHasBusy(wd) {
    for (const [tid, t] of tabState.tabs) if (t.workDir === wd && busyTabs.has(tid)) return true;
    return false;
  }
  document.querySelectorAll('.worktree-item').forEach(el => {
    const wd = el.dataset.path;
    const busy = wdHasBusy(wd);
    const notif = !busy && notifActivity.has(wd) && notifActivity.get(wd).size > 0;
    el.classList.toggle('has-busy', busy);
    el.classList.toggle('has-notification', notif);
  });
  document.querySelectorAll('.project-entry').forEach(el => {
    let busy = false, notif = false;
    if (el.classList.contains('is-git')) {
      el.querySelectorAll('.worktree-item').forEach(wt => {
        const wd = wt.dataset.path;
        if (wdHasBusy(wd)) busy = true;
        if (notifActivity.has(wd) && notifActivity.get(wd).size > 0) notif = true;
      });
    } else {
      const wd = el.dataset.path;
      busy = wdHasBusy(wd);
      notif = notifActivity.has(wd) && notifActivity.get(wd).size > 0;
    }
    const pi = el.querySelector('.project-item');
    if (pi) {
      const isExpanded = el.classList.contains('expanded');
      pi.classList.toggle('has-busy', busy && !isExpanded);
      pi.classList.toggle('has-notification', !busy && notif && !isExpanded);
    }
  });
  const unseenCount = notifLog.filter(n => !n.seen).length;
  const countEl = document.getElementById('notif-count');
  countEl.textContent = unseenCount > 99 ? '99+' : unseenCount;
  countEl.classList.toggle('hidden', unseenCount === 0);
  for (const [id, tab] of tabState.tabs) {
    if (tab.tabEl) {
      const isBusy = busyTabs.has(id);
      const hasNotif = !isBusy && notifLog.some(n => n.tabId === id && !n.seen);
      tab.tabEl.classList.toggle('is-busy', isBusy);
      tab.tabEl.classList.toggle('has-notification', hasNotif);
    }
  }
}

export function clearNotifForTab(tabId) {
  if (notifDebounceTimers.has(tabId)) {
    clearTimeout(notifDebounceTimers.get(tabId));
    notifDebounceTimers.delete(tabId);
  }
  for (const [wd, set] of notifActivity) {
    set.delete(tabId);
    if (set.size === 0) notifActivity.delete(wd);
  }
  for (const entry of notifLog) {
    if (entry.tabId === tabId) entry.seen = true;
  }
  updateNotifUI();
}

export function markTabBusy(tabId) {
  busyTabs.add(tabId);
  const tab = tabState.tabs.get(tabId);
  if (tab?.tabEl) tab.tabEl.classList.add('is-busy');
  scheduleNotifUpdate();
}

export function clearTabBusy(tabId) {
  busyTabs.delete(tabId);
  if (busyDebounceTimers.has(tabId)) {
    clearTimeout(busyDebounceTimers.get(tabId));
    busyDebounceTimers.delete(tabId);
  }
  const tab = tabState.tabs.get(tabId);
  if (tab?.tabEl) tab.tabEl.classList.remove('is-busy');
  scheduleNotifUpdate();
}

export function renderNotifDropdown() {
  const list = document.getElementById('notification-list');
  if (notifLog.length === 0) {
    list.innerHTML = '<div class="notif-empty">No notifications</div>';
    return;
  }
  list.innerHTML = notifLog.slice(0, 30).map(n => {
    const ago = formatTimeAgo(n.timestamp);
    const projectLabel = getWorkDirLabel(n.workDir);
    return `<div class="notif-entry${n.seen ? ' seen' : ''}" data-tab-id="${n.tabId}" data-work-dir="${escHtml(n.workDir)}">
      <div class="notif-dot-indicator"></div>
      <div class="notif-body">
        <div class="notif-title"><span>${escHtml(n.tabLabel)}</span><span class="notif-project">${escHtml(projectLabel)}</span></div>
        <div class="notif-snippet">${escHtml(n.snippet)}</div>
      </div>
      <div class="notif-time">${ago}</div>
    </div>`;
  }).join('');
}

// ── Initialization ──────────────────────────────────────────────

export function initNotifications({ openWorkDir, switchTab, exitSettings }) {
  const notifBell = document.getElementById('notification-bell');
  const notifDropdown = document.getElementById('notification-dropdown');
  const settingsView = document.getElementById('settings-view');

  notifBell.addEventListener('click', (e) => {
    e.stopPropagation();
    const isActive = notifDropdown.classList.toggle('active');
    if (isActive) renderNotifDropdown();
  });

  document.addEventListener('click', (e) => {
    if (!notifDropdown.contains(e.target) && e.target !== notifBell) {
      notifDropdown.classList.remove('active');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && notifDropdown.classList.contains('active')) {
      notifDropdown.classList.remove('active');
    }
  });

  document.getElementById('notification-clear-btn').addEventListener('click', () => {
    notifLog.length = 0;
    notifActivity.clear();
    updateNotifUI();
    renderNotifDropdown();
  });

  document.getElementById('notification-list').addEventListener('click', (e) => {
    const entry = e.target.closest('.notif-entry');
    if (!entry) return;
    const tabId = parseInt(entry.dataset.tabId);
    const workDir = entry.dataset.workDir;

    const logEntry = notifLog.find(n => n.tabId === tabId && !n.seen);
    if (logEntry) logEntry.seen = true;

    if (tabState.tabs.has(tabId)) {
      if (settingsView.classList.contains('active')) exitSettings();
      if (tabState.activeWorkDir !== workDir) openWorkDir(workDir);
      switchTab(tabId);
    }
    notifDropdown.classList.remove('active');
    updateNotifUI();
  });
}
