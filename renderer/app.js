// ── Braska Renderer Entry Point ──
// Imports all modules, wires cross-module dependencies, and initializes the app.

import { tabState, appState, watchState, ghState } from './state.js';
import { loadProjects, refreshWorktreeMetrics, refreshProjectBadges, initSidebar } from './sidebar.js';
import { showWorktreeContextMenu, openWorktreeCreateModal, openMergeModal, initWorktreeModals } from './worktree-modals.js';
import { enterSettings, exitSettings, bindSettingsDeps, initSettings } from './settings.js';
import { tabsForWorkDir, renderTabBar, switchTab, closeTab, addTabToOrder, removeTabFromOrder, initTabs } from './tabs.js';
import { startTask, startBrowser, openFileEditor, initTerminals } from './terminals.js';
import { updateNotifUI, initNotifications } from './notifications.js';
import { refreshFileTree, updateFileTreeHighlights, restoreExplorerState, setRightPanelMode, switchRightPanelTab, toggleSidebar, toggleFiletree, initFileExplorer } from './file-explorer.js';
import { refreshChanges, stageAndPromptCommit, doPullLatestMain, openDiffTab, openBranchModal, doPush, showChangesStatus, switchToGitHubView, initGitChanges, initPostCommitPromptBridge, initGitHubViewBridge } from './git-changes.js';
// post-commit-prompt.js is superseded by journey-zone.js — kept for reference only
import { initJourneyZone, renderJourneyZone, onCommitterExit, onGithubSpecialistExit, dismissPostCommitPrompt } from './journey-zone.js';
import { refreshGitHub, showGitHubIssueDetail, initGitHubPanel } from './github-panel.js';
import { initGitHubPRs, showGitHubPRDetail } from './github-prs.js';
import { refreshTodos, showTodoClosePrompt, updateTodoFocus, initTodoPanel } from './todo-panel.js';
import { initHoverLink } from './hover-link.js';
import { initCloneModal } from './clone-modal.js';
import { initDiagnosticsPanel } from './diagnostics-panel.js';

// ── Prevent Electron from navigating to dropped files ──
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());

// ── Pause always-on UI work when the window is hidden (gh issue #30) ──
// Toggles body.app-hidden (CSS pauses animations) and freezes xterm cursor blink
// on every live terminal tab. Restored on visibility.
document.addEventListener('visibilitychange', () => {
  const hidden = document.hidden;
  document.body.classList.toggle('app-hidden', hidden);
  for (const tab of tabState.tabs.values()) {
    if (tab.type === 'terminal' && tab.term) {
      try { tab.term.options.cursorBlink = !hidden; } catch { /* old xterm shape */ }
    }
  }
});

// ── Version info ──
const info = document.getElementById('info');
info.innerText = `Electron ${window.versions.electron()} | Chrome ${window.versions.chrome()} | Node ${window.versions.node()}`;

// ── Core navigation functions ──

function setBreadcrumb(workDir) {
  const el = document.getElementById('breadcrumb');
  const projectList = document.getElementById('project-list');
  document.querySelectorAll('.worktree-item.active').forEach(w => w.classList.remove('active'));
  document.querySelectorAll('.project-entry.has-active').forEach(e => e.classList.remove('has-active'));
  document.querySelectorAll('.project-section-link.active').forEach(l => l.classList.remove('active'));
  if (!workDir) { el.textContent = ''; return; }
  let label = '';
  let found = false;
  projectList.querySelectorAll('.worktree-item').forEach(w => {
    if (w.dataset.path === workDir) {
      w.classList.add('active');
      const entry = w.closest('.project-entry');
      if (entry) {
        entry.classList.add('has-active');
        if (!entry.classList.contains('expanded')) {
          entry.classList.add('expanded');
        }
      }
      const projectName = entry?.querySelector('.project-name')?.textContent || '';
      const branch = w.textContent.trim();
      label = projectName ? `${projectName} / ${branch}` : branch;
      found = true;
    }
  });
  if (!found) {
    projectList.querySelectorAll('.project-entry').forEach(entry => {
      if (entry.dataset.path === workDir) {
        entry.classList.add('has-active');
        label = entry.querySelector('.project-name')?.textContent || workDir.split('/').pop();
        found = true;
      }
    });
  }
  if (!found) label = workDir.split('/').pop();
  el.textContent = label;
}

export function refreshRightPanel(workDir) {
  // Only refresh if file tree panel is visible
  const filetreePanel = document.getElementById('filetree-panel');
  if (filetreePanel.classList.contains('hidden') || !workDir) return;
  const activePanel = document.querySelector('.filetree-tab.active')?.dataset.panel;
  if (activePanel === 'changes') refreshChanges(workDir);
  else if (activePanel === 'todo') refreshTodos(workDir);
  else if (activePanel === 'github') refreshGitHub(workDir);
  else refreshFileTree(workDir);
}

export function openWorkDir(workDir) {
  const mainPanel = document.getElementById('main');
  const settingsPanel = document.getElementById('settings-panel');
  const launchpad = document.getElementById('launchpad');
  const terminalView = document.getElementById('terminal-view');

  // Clear project-scope mode when switching to a worktree
  appState.projectScopeMode = null;
  appState.projectScopePath = null;
  document.querySelectorAll('.project-section-link.active').forEach(l => l.classList.remove('active'));

  setRightPanelMode('worktree');
  setBreadcrumb(workDir);
  restoreExplorerState(workDir);
  window.filetree.watch(workDir);
  window.todo.watch(workDir);
  const existing = tabsForWorkDir(workDir);
  if (existing.length > 0) {
    tabState.activeWorkDir = workDir;
    refreshRightPanel(workDir);
    mainPanel.style.display = 'none';
    settingsPanel.classList.remove('active');
    launchpad.classList.remove('active');
    terminalView.classList.add('active');
    renderTabBar();
    if (!tabState.activeTabId || tabState.tabs.get(tabState.activeTabId)?.workDir !== workDir) {
      switchTab(existing[existing.length - 1][0]);
    } else {
      switchTab(tabState.activeTabId);
    }
  } else {
    tabState.activeWorkDir = workDir;
    tabState.activeTabId = null;
    refreshRightPanel(workDir);
    window.browserView.setActive(null);
    mainPanel.style.display = 'none';
    settingsPanel.classList.remove('active');
    terminalView.classList.remove('active');
    launchpad.classList.add('active');
  }
}

// ── Project-scope navigation (sidebar section links) ──

function openProjectScope(projectPath, section) {
  const mainPanel = document.getElementById('main');
  const settingsPanel = document.getElementById('settings-panel');
  const launchpad = document.getElementById('launchpad');
  const terminalView = document.getElementById('terminal-view');
  const filetreePanel = document.getElementById('filetree-panel');

  // Find the main worktree to use as workDir for IPC
  const entry = document.querySelector(`.project-entry[data-path="${CSS.escape(projectPath)}"]`);
  const mainWt = entry?.querySelector('.worktree-item[data-is-main="true"]');
  const workDir = mainWt ? mainWt.dataset.path : projectPath;

  // Track project-scope mode in state
  appState.projectScopeMode = section;
  appState.projectScopePath = projectPath;
  tabState.activeWorkDir = workDir;
  tabState.activeTabId = null;

  // Set breadcrumb to "ProjectName / Section"
  const projectName = entry?.querySelector('.project-name')?.textContent || projectPath.split('/').pop();
  const sectionLabel = section === 'todos' ? 'Todos' : 'GitHub';
  const el = document.getElementById('breadcrumb');
  el.textContent = `${projectName} / ${sectionLabel}`;

  // Highlight the active section link in the sidebar
  document.querySelectorAll('.worktree-item.active').forEach(w => w.classList.remove('active'));
  document.querySelectorAll('.project-entry.has-active').forEach(e => e.classList.remove('has-active'));
  document.querySelectorAll('.project-section-link.active').forEach(l => l.classList.remove('active'));
  if (entry) {
    entry.classList.add('has-active');
    if (!entry.classList.contains('expanded')) entry.classList.add('expanded');
    const link = entry.querySelector(`.project-section-link[data-section="${section}"]`);
    if (link) link.classList.add('active');
  }

  // Show launchpad with project-scope message; hide terminal
  window.browserView.setActive(null);
  mainPanel.style.display = 'none';
  settingsPanel.classList.remove('active');
  terminalView.classList.remove('active');
  launchpad.classList.add('active');

  // Show the right panel and switch to the correct mode
  filetreePanel.classList.remove('hidden');
  document.getElementById('filetree-resize').classList.remove('hidden');

  if (section === 'todos') {
    switchRightPanelTab('todo');
  } else if (section === 'github') {
    switchRightPanelTab('github');
  }
}

// ── Tab picker function ──

function showTabTypePicker(workDir) {
  appState.pendingWorkDir = workDir;
  document.getElementById('tab-type-picker').classList.add('active');
}

// ── File watcher callbacks ──

window.filetree.onChange((filename) => {
  clearTimeout(watchState.fsWatchDebounce);
  watchState.fsWatchDebounce = setTimeout(() => {
    if (!tabState.activeWorkDir) return;
    const isGitChange = filename && (filename === '.git' || filename.startsWith('.git/'));
    if (isGitChange) {
      // Refresh sidebar when .git appears in a non-git project (e.g. after git init)
      const entry = document.querySelector(`.project-entry[data-path="${CSS.escape(tabState.activeWorkDir)}"]`);
      if (entry && !entry.classList.contains('is-git')) loadProjects();
      // Always refresh git panel on .git changes, even when viewing todo/github
      refreshChanges(tabState.activeWorkDir);
      return;
    }
    const activePanel = document.querySelector('.filetree-tab.active')?.dataset.panel;
    if (activePanel === 'todo' || activePanel === 'github') return;
    refreshRightPanel(tabState.activeWorkDir);
  }, 300);
});

window.todo.onChange(() => {
  clearTimeout(watchState.todoWatchDebounce);
  watchState.todoWatchDebounce = setTimeout(() => {
    if (!tabState.activeWorkDir) return;
    refreshTodos(tabState.activeWorkDir);
    // Keep sidebar badge in sync when todos change
    const entry = document.querySelector(`.worktree-item[data-path="${CSS.escape(tabState.activeWorkDir)}"]`)?.closest('.project-entry');
    const projectPath = entry?.dataset.path;
    if (projectPath) refreshProjectBadges(projectPath);
  }, 300);
});

// Background fetch completed — update stale-main indicators.
window.gitOps.onFetched(() => {
  clearTimeout(watchState.fetchRefreshDebounce);
  watchState.fetchRefreshDebounce = setTimeout(() => {
    refreshWorktreeMetrics();
    if (tabState.activeWorkDir) refreshChanges(tabState.activeWorkDir);
  }, 300);
});

// Git HEAD or worktree structure changed externally — reload sidebar.
window.gitOps.onProjectsChanged(() => {
  clearTimeout(watchState.projectsChangedDebounce);
  watchState.projectsChangedDebounce = setTimeout(() => loadProjects(), 400);
});

// ── Open a linked GitHub issue without unselecting the worktree ──
// Used by sidebar.js when the user clicks the gh-issue icon on a worktree row.
// Keeps the worktree active + reveals its tabs (via openWorkDir), then routes
// the right panel into the GitHub → Issues section straight to the detail view.
function openIssueInPanel(workDir, issueNumber) {
  openWorkDir(workDir);
  ghState.section = 'issues';
  ghState.directIssueNumber = issueNumber;
  switchRightPanelTab('github');
}

// ── Initialize all modules ──

// Modules that need cross-module function references
initSidebar({ openWorkDir, openWorktreeCreateModal, showWorktreeContextMenu, openProjectScope, openIssueInPanel });
initWorktreeModals({ loadProjects, openWorkDir, closeTab, tabsForWorkDir, startTask, doPullLatestMain });
bindSettingsDeps({ openWorkDir, setBreadcrumb });
initSettings();
initTabs({ showTabTypePicker, updateFileTreeHighlights, showTodoClosePrompt, refreshTodos, updateTodoFocus, refreshRightPanel });
initTerminals({ refreshRightPanel });
initNotifications({ openWorkDir, switchTab, exitSettings });
initFileExplorer({ openFileEditor, openDiffTab, refreshChanges, startTask, startBrowser, switchTab, refreshTodos, refreshGitHub });
initGitChanges({ refreshFileTree, startTask, loadProjects, switchTab, addTabToOrder, renderTabBar, tabsForWorkDir });
initPostCommitPromptBridge();
initGitHubViewBridge({ refreshGitHub, switchRightPanelTab });
initJourneyZone({ doPush, doPullLatestMain, openBranchModal, refreshChanges, showChangesStatus, startTask, refreshWorktreeMetrics, loadProjects, openWorkDir, switchToGitHubView, showGitHubPRDetail });
initGitHubPanel({ startTask, switchRightPanelTab, loadProjects, openWorkDir });
initGitHubPRs({ loadProjects, openWorkDir, closeTab, tabsForWorkDir });
initTodoPanel({ loadProjects, openWorkDir, startTask, showGitHubIssueDetail, switchRightPanelTab, switchToGitHubView });
initHoverLink();
initCloneModal({ loadProjects, openWorkDir });
initDiagnosticsPanel();

// ── Tab type picker modal handlers ──

document.getElementById('tab-type-picker-cancel').addEventListener('click', () => {
  document.getElementById('tab-type-picker').classList.remove('active');
  appState.pendingWorkDir = null;
});

document.getElementById('tab-type-picker-list').addEventListener('click', (e) => {
  const item = e.target.closest('.tab-type-picker-item');
  if (!item || !appState.pendingWorkDir) return;
  document.getElementById('tab-type-picker').classList.remove('active');
  if (item.dataset.type === 'terminal') {
    startTask('__TERMINAL__', appState.pendingWorkDir);
    appState.pendingWorkDir = null;
  } else if (item.dataset.type === 'browser') {
    startBrowser(appState.pendingWorkDir);
    appState.pendingWorkDir = null;
  } else if (item.dataset.type === 'claude') {
    startTask('__CLAUDE__', appState.pendingWorkDir);
    appState.pendingWorkDir = null;
  } else if (item.dataset.type === 'claude-yolo') {
    startTask('__CLAUDE__', appState.pendingWorkDir, { skipPermissions: true });
    appState.pendingWorkDir = null;
  }
});

// ── Launchpad buttons ──

document.getElementById('launchpad-agent').addEventListener('click', () => {
  if (tabState.activeWorkDir) startTask('__CLAUDE__', tabState.activeWorkDir);
});

document.getElementById('launchpad-terminal').addEventListener('click', () => {
  if (tabState.activeWorkDir) startTask('__TERMINAL__', tabState.activeWorkDir);
});

document.getElementById('launchpad-browser').addEventListener('click', () => {
  if (tabState.activeWorkDir) startBrowser(tabState.activeWorkDir);
});

document.getElementById('launchpad-agent-yolo').addEventListener('click', () => {
  if (tabState.activeWorkDir) startTask('__CLAUDE__', tabState.activeWorkDir, { skipPermissions: true });
});

// ── Keyboard shortcuts ──

document.addEventListener('keydown', (e) => {
  const tabTypePicker = document.getElementById('tab-type-picker');
  const tabTypeActive = tabTypePicker.classList.contains('active');

  // Cmd+T to open tab-type picker
  if ((e.metaKey || e.ctrlKey) && e.key === 't') {
    e.preventDefault();
    if (tabState.activeWorkDir) showTabTypePicker(tabState.activeWorkDir);
    return;
  }

  // Escape closes the picker
  if (e.key === 'Escape' && tabTypeActive) {
    e.preventDefault();
    document.getElementById('tab-type-picker-cancel').click();
    return;
  }

  // Number keys select items in the open picker
  if (tabTypeActive && e.key >= '1' && e.key <= '9') {
    e.preventDefault();
    const item = tabTypePicker.querySelector(`.tab-type-picker-item[data-hotkey="${e.key}"]`);
    if (item) item.click();
    return;
  }

  // Cmd+1-9 to switch tabs (only when no picker is open)
  if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
    e.preventDefault();
    const idx = parseInt(e.key) - 1;
    const wdTabs = tabsForWorkDir(tabState.activeWorkDir);
    if (idx < wdTabs.length) switchTab(wdTabs[idx][0]);
    return;
  }

  // Cmd+S to save the active editor tab
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    const activeTab = tabState.tabs.get(tabState.activeTabId);
    if (activeTab && activeTab.type === 'editor' && activeTab.saveFile) {
      e.preventDefault();
      activeTab.saveFile();
    }
  }
});
