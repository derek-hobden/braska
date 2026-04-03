// ── Braska Renderer Entry Point ──
// Imports all modules, wires cross-module dependencies, and initializes the app.

import { tabState, appState, watchState } from './state.js';
import { loadProjects, refreshWorktreeMetrics, initSidebar } from './sidebar.js';
import { showWorktreeContextMenu, openWorktreeCreateModal, openMergeModal, initWorktreeModals } from './worktree-modals.js';
import { enterSettings, exitSettings, bindSettingsDeps, initSettings } from './settings.js';
import { tabsForWorkDir, renderTabBar, switchTab, closeTab, addTabToOrder, removeTabFromOrder, initTabs } from './tabs.js';
import { startTask, startBrowser, openFileEditor, initTerminals } from './terminals.js';
import { updateNotifUI, initNotifications } from './notifications.js';
import { refreshFileTree, updateFileTreeHighlights, restoreExplorerState, switchRightPanelTab, toggleSidebar, toggleFiletree, initFileExplorer } from './file-explorer.js';
import { refreshChanges, stageAndPromptCommit, doPullLatestMain, openDiffTab, openBranchModal, initGitChanges } from './git-changes.js';
import { refreshGitHub, showGitHubIssueDetail, initGitHubPanel } from './github-panel.js';
import { refreshTodos, showTodoClosePrompt, initTodoPanel } from './todo-panel.js';

// ── Prevent Electron from navigating to dropped files ──
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => e.preventDefault());

// ── Version info ──
const info = document.getElementById('info');
info.innerText = `Electron ${window.versions.electron()} | Chrome ${window.versions.chrome()} | Node ${window.versions.node()}`;

// ── Core navigation functions ──

function setBreadcrumb(workDir) {
  const el = document.getElementById('breadcrumb');
  const projectList = document.getElementById('project-list');
  document.querySelectorAll('.worktree-item.active').forEach(w => w.classList.remove('active'));
  document.querySelectorAll('.project-entry.has-active').forEach(e => e.classList.remove('has-active'));
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
    mainPanel.style.display = 'none';
    settingsPanel.classList.remove('active');
    terminalView.classList.remove('active');
    launchpad.classList.add('active');
  }
}

// ── Agent/tab picker functions ──

import { agentDisplayName, escHtml } from './utils.js';

function showTabTypePicker(workDir) {
  appState.pendingWorkDir = workDir;
  document.getElementById('tab-type-picker').classList.add('active');
}

function renderAgentPickerItems(agents) {
  const builtinAgents = agents.filter(ex => ex.builtin);
  const customAgents = agents.filter(ex => !ex.builtin);
  let n = 1;
  const hint = () => n <= 9 ? `<span class="agent-picker-hint">⌘${n++}</span>` : (n++, '');
  const claudeItem = `<div class="agent-picker-item" data-name="__CLAUDE__" style="color:#e0a050;font-weight:600">${escHtml(agentDisplayName('__CLAUDE__'))}${hint()}</div>`;
  const builtinItems = builtinAgents.map(ex => {
    return `<div class="agent-picker-item builtin" data-name="${escHtml(ex.name)}">${escHtml(agentDisplayName(ex.name))}${hint()}</div>`;
  }).join('');
  const customItems = customAgents.map(ex => {
    return `<div class="agent-picker-item" data-name="${escHtml(ex.name)}">${escHtml(agentDisplayName(ex.name))}${hint()}</div>`;
  }).join('');
  let html = '<div class="agent-picker-label">System</div>' + claudeItem + builtinItems;
  if (customAgents.length > 0) {
    html += '<div class="agent-picker-separator"></div><div class="agent-picker-label">Custom</div>' + customItems;
  }
  return html;
}

async function showAgentPicker(workDir) {
  appState.pendingWorkDir = workDir;
  const agents = await window.agents.list();
  document.getElementById('agent-picker-list').innerHTML = renderAgentPickerItems(agents);
  document.getElementById('agent-picker').classList.add('active');
}

export function showAgentPickerForTodo(workDir, todoPath, todoAbsPath) {
  appState.pendingTodoPath = todoPath;
  appState.pendingTodoAbsPath = todoAbsPath;
  showAgentPicker(workDir);
}

// ── File watcher callbacks ──

window.filetree.onChange((filename) => {
  clearTimeout(watchState.fsWatchDebounce);
  watchState.fsWatchDebounce = setTimeout(() => {
    if (!tabState.activeWorkDir) return;
    // Refresh sidebar when .git appears in a non-git project (e.g. after git init)
    if (filename && (filename === '.git' || filename.startsWith('.git/'))) {
      const entry = document.querySelector(`.project-entry[data-path="${CSS.escape(tabState.activeWorkDir)}"]`);
      if (entry && !entry.classList.contains('is-git')) loadProjects();
    }
    const activePanel = document.querySelector('.filetree-tab.active')?.dataset.panel;
    if (activePanel === 'todo') return;
    if (activePanel === 'github') return;
    refreshRightPanel(tabState.activeWorkDir);
  }, 300);
});

window.todo.onChange(() => {
  clearTimeout(watchState.todoWatchDebounce);
  watchState.todoWatchDebounce = setTimeout(() => {
    if (!tabState.activeWorkDir) return;
    refreshTodos(tabState.activeWorkDir);
  }, 300);
});

// ── Initialize all modules ──

// Modules that need cross-module function references
initSidebar({ openWorkDir, openWorktreeCreateModal, showWorktreeContextMenu });
initWorktreeModals({ loadProjects, openWorkDir, closeTab, tabsForWorkDir, startTask, doPullLatestMain });
bindSettingsDeps({ openWorkDir, setBreadcrumb });
initSettings();
initTabs({ showTabTypePicker, updateFileTreeHighlights, showTodoClosePrompt, refreshTodos });
initTerminals({ refreshRightPanel });
initNotifications({ openWorkDir, switchTab, exitSettings });
initFileExplorer({ openFileEditor, openDiffTab, refreshChanges, startTask, refreshTodos, refreshGitHub });
initGitChanges({ refreshFileTree, startTask, loadProjects, switchTab, addTabToOrder, renderTabBar, tabsForWorkDir });
initGitHubPanel({ startTask, switchRightPanelTab });
initTodoPanel({ loadProjects, openWorkDir, startTask, showAgentPickerForTodo, showGitHubIssueDetail, switchRightPanelTab });

// ── Tab type picker & agent picker modal handlers ──

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
  } else if (item.dataset.type === 'agent') {
    showAgentPicker(appState.pendingWorkDir);
  }
});

document.getElementById('agent-picker-cancel').addEventListener('click', () => {
  document.getElementById('agent-picker').classList.remove('active');
  appState.pendingWorkDir = null;
  appState.pendingTodoPath = null;
  appState.pendingTodoAbsPath = null;
});

document.getElementById('agent-picker-list').addEventListener('click', (e) => {
  const item = e.target.closest('.agent-picker-item');
  if (!item || !appState.pendingWorkDir) return;
  const name = item.dataset.name;
  document.getElementById('agent-picker').classList.remove('active');

  if (appState.pendingTodoPath) {
    const todoPath = appState.pendingTodoPath;
    const todoAbsPath = appState.pendingTodoAbsPath;
    appState.pendingTodoPath = null;
    appState.pendingTodoAbsPath = null;
    const todoNum = todoPath.split('/').pop().match(/^(\d+)/)?.[1] || '';
    startTask(name, appState.pendingWorkDir, {
      initialPrompt: `/plan Read the todo file at ${todoAbsPath} and complete the task. When finished, ask me if I'd like to close the todo as done.`,
      todoNumber: todoNum,
      todoPath
    });
  } else {
    startTask(name, appState.pendingWorkDir);
  }
  appState.pendingWorkDir = null;
});

// ── Launchpad buttons ──

document.getElementById('launchpad-agent').addEventListener('click', () => {
  if (tabState.activeWorkDir) showAgentPicker(tabState.activeWorkDir);
});

document.getElementById('launchpad-terminal').addEventListener('click', () => {
  if (tabState.activeWorkDir) startTask('__TERMINAL__', tabState.activeWorkDir);
});

document.getElementById('launchpad-browser').addEventListener('click', () => {
  if (tabState.activeWorkDir) startBrowser(tabState.activeWorkDir);
});

// ── Keyboard shortcuts ──

document.addEventListener('keydown', (e) => {
  const tabTypePicker = document.getElementById('tab-type-picker');
  const agentPicker = document.getElementById('agent-picker');
  const tabTypeActive = tabTypePicker.classList.contains('active');
  const agentActive = agentPicker.classList.contains('active');

  // Cmd+T to open tab-type picker
  if ((e.metaKey || e.ctrlKey) && e.key === 't') {
    e.preventDefault();
    if (tabState.activeWorkDir) showTabTypePicker(tabState.activeWorkDir);
    return;
  }

  // Escape closes any open picker
  if (e.key === 'Escape') {
    if (agentActive) {
      e.preventDefault();
      document.getElementById('agent-picker-cancel').click();
      return;
    }
    if (tabTypeActive) {
      e.preventDefault();
      document.getElementById('tab-type-picker-cancel').click();
      return;
    }
  }

  // Number keys (bare or Cmd+) select items in open pickers
  if (tabTypeActive && e.key >= '1' && e.key <= '9') {
    e.preventDefault();
    const item = tabTypePicker.querySelector(`.tab-type-picker-item[data-hotkey="${e.key}"]`);
    if (item) item.click();
    return;
  }
  if (agentActive && e.key >= '1' && e.key <= '9') {
    e.preventDefault();
    const items = agentPicker.querySelectorAll('.agent-picker-item');
    const idx = parseInt(e.key) - 1;
    if (idx < items.length) items[idx].click();
    return;
  }

  // Cmd+1-9 to switch tabs (only when no picker is open)
  if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
    e.preventDefault();
    const idx = parseInt(e.key) - 1;
    const wdTabs = tabsForWorkDir(tabState.activeWorkDir);
    if (idx < wdTabs.length) switchTab(wdTabs[idx][0]);
  }
});
