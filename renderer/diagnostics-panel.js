// Diagnostics panel — Cmd+Shift+D toggles a floating overlay that polls
// main+renderer counters every 2s. Built for gh issue #30 to measure idle CPU
// sources and per-operation latency rather than guessing.

import { tabState } from './state.js';
import { notifLog, busyTabs, notifDebounceTimers, busyDebounceTimers } from './notifications.js';

const POLL_MS = 2000;
let panel = null;
let pollHandle = null;
let mountedAt = 0;

function fmtBytes(n) {
  if (n < 1024) return n + 'B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + 'K';
  return (n / 1024 / 1024).toFixed(1) + 'M';
}

function snapshotRenderer() {
  let terminals = 0, browsers = 0, editors = 0, diffs = 0, other = 0;
  for (const t of tabState.tabs.values()) {
    if (t.type === 'terminal') terminals++;
    else if (t.type === 'browser') browsers++;
    else if (t.type === 'editor') editors++;
    else if (t.type === 'diff') diffs++;
    else other++;
  }
  return {
    tabs: { terminals, browsers, editors, diffs, other, total: tabState.tabs.size },
    notifLog: notifLog.length,
    busyTabs: busyTabs.size,
    notifDebounceTimers: notifDebounceTimers.size,
    busyDebounceTimers: busyDebounceTimers.size,
    activeWorkDir: tabState.activeWorkDir || '(none)',
  };
}

function render(mainSnap, rendererSnap) {
  if (!panel) return;
  const uptime = ((Date.now() - mountedAt) / 1000).toFixed(0);
  const m = mainSnap?.main;
  const mem = m?.memory;
  const c = m?.counts;
  panel.innerHTML = `
    <div class="diag-header">
      <span>Diagnostics</span>
      <span class="diag-uptime">panel open ${uptime}s</span>
      <button class="diag-close" title="Close (Cmd+Shift+D)">&times;</button>
    </div>
    <div class="diag-section">
      <div class="diag-section-title">Main — memory</div>
      <div class="diag-row"><span>rss</span><span>${mem ? fmtBytes(mem.rss) : '?'}</span></div>
      <div class="diag-row"><span>heap used</span><span>${mem ? fmtBytes(mem.heapUsed) : '?'}</span></div>
      <div class="diag-row"><span>heap total</span><span>${mem ? fmtBytes(mem.heapTotal) : '?'}</span></div>
      <div class="diag-row"><span>external</span><span>${mem ? fmtBytes(mem.external) : '?'}</span></div>
    </div>
    <div class="diag-section">
      <div class="diag-section-title">Main — counts</div>
      <div class="diag-row"><span>PTY processes</span><span>${c ? c.ptyProcesses : '?'}</span></div>
      <div class="diag-row"><span>filetree watcher</span><span>${c ? c.activeFiletreeWatcher : '?'}</span></div>
      <div class="diag-row"><span>git-dir watcher</span><span>${c ? c.activeGitDirWatcher : '?'}</span></div>
      <div class="diag-row"><span>todo watcher</span><span>${c ? c.activeTodoWatcher : '?'}</span></div>
      <div class="diag-row"><span>per-project git watchers</span><span>${c ? c.gitProjectsWatchers : '?'}</span></div>
      <div class="diag-row"><span>fetcher state entries</span><span>${c ? c.gitFetcherState : '?'}</span></div>
    </div>
    <div class="diag-section">
      <div class="diag-section-title">Renderer</div>
      <div class="diag-row"><span>tabs (term/browser/edit/diff)</span><span>${rendererSnap.tabs.terminals}/${rendererSnap.tabs.browsers}/${rendererSnap.tabs.editors}/${rendererSnap.tabs.diffs}</span></div>
      <div class="diag-row"><span>tabs total</span><span>${rendererSnap.tabs.total}</span></div>
      <div class="diag-row"><span>notifLog entries</span><span>${rendererSnap.notifLog}</span></div>
      <div class="diag-row"><span>busyTabs</span><span>${rendererSnap.busyTabs}</span></div>
      <div class="diag-row"><span>notif debounce timers</span><span>${rendererSnap.notifDebounceTimers}</span></div>
      <div class="diag-row"><span>busy debounce timers</span><span>${rendererSnap.busyDebounceTimers}</span></div>
    </div>
    <div class="diag-hint">Cmd+Shift+D to close · timing logs go to DevTools console</div>
  `;
  panel.querySelector('.diag-close').addEventListener('click', closeDiagnosticsPanel);
}

async function tick() {
  try {
    const mainSnap = await window.diagnostics.snapshot();
    render(mainSnap, snapshotRenderer());
  } catch (err) {
    if (panel) panel.innerHTML = `<div class="diag-error">snapshot failed: ${err.message}</div>`;
  }
}

export function openDiagnosticsPanel() {
  if (panel) return;
  panel = document.createElement('div');
  panel.id = 'diagnostics-panel';
  document.body.appendChild(panel);
  mountedAt = Date.now();
  tick();
  pollHandle = setInterval(tick, POLL_MS);
}

export function closeDiagnosticsPanel() {
  if (pollHandle) { clearInterval(pollHandle); pollHandle = null; }
  if (panel) { panel.remove(); panel = null; }
}

export function toggleDiagnosticsPanel() {
  if (panel) closeDiagnosticsPanel();
  else openDiagnosticsPanel();
}

export function initDiagnosticsPanel() {
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      toggleDiagnosticsPanel();
    }
  });
}
