// ── Todo panel module ───────────────────────────────────────────
// Extracted from the monolithic renderer. Handles todo listing,
// detail view, worktree creation for todos, and agent launching.

import { tabState, ghState } from './state.js';
import { escHtml, generateTodoBranchName, todoPriorityIcon, todoTypeIcon } from './utils.js';

// ── DOM refs (queried once at module level) ────────────────────
const todoBody = document.getElementById('todo-body');

// ── Cross-module deps injected via init ────────────────────────
let _loadProjects = null;
let _openWorkDir = null;
let _startTask = null;
let _showAgentPickerForTodo = null;
let _showGitHubIssueDetail = null;
let _switchRightPanelTab = null;
let _switchToGitHubView = null;

export function initTodoPanel({ loadProjects, openWorkDir, startTask, showAgentPickerForTodo, showGitHubIssueDetail, switchRightPanelTab, switchToGitHubView }) {
  _loadProjects = loadProjects;
  _openWorkDir = openWorkDir;
  _startTask = startTask;
  _showAgentPickerForTodo = showAgentPickerForTodo;
  _showGitHubIssueDetail = showGitHubIssueDetail;
  _switchRightPanelTab = switchRightPanelTab;
  _switchToGitHubView = switchToGitHubView;

  // ── Todo close modal button handlers ────────────────────────
  document.getElementById('todo-close-done-btn').addEventListener('click', () => closeTodoCloseModal('done'));
  document.getElementById('todo-close-leave-btn').addEventListener('click', () => closeTodoCloseModal('leave'));
  document.getElementById('todo-close-cancel-btn').addEventListener('click', () => closeTodoCloseModal('cancel'));

  // ── Event delegation on todoBody ─────────────────────────────
  todoBody.addEventListener('click', async (e) => {
    const backBtn = e.target.closest('.todo-detail-back');
    if (backBtn) {
      refreshTodos(tabState.activeWorkDir);
      return;
    }

    const workBtn = e.target.closest('.todo-work-btn');
    if (workBtn) {
      const todoPath = workBtn.dataset.todoPath;
      const todoAbsPath = workBtn.dataset.absPath;
      _showAgentPickerForTodo(tabState.activeWorkDir, todoPath, todoAbsPath);
      return;
    }

    const worktreeBtn = e.target.closest('.todo-worktree-btn');
    if (worktreeBtn) {
      const todoPath = worktreeBtn.dataset.todoPath;
      const todoAbsPath = worktreeBtn.dataset.absPath;
      workOnTodoInNewWorktree(todoPath, todoAbsPath);
      return;
    }

    const doneBtn = e.target.closest('.todo-done-btn');
    if (doneBtn) {
      const todoPath = doneBtn.dataset.todoPath;
      const doneResult = await window.todo.close(tabState.activeWorkDir, todoPath, 'done');
      if (!doneResult?.ok) console.error('[Braska] Failed to close todo:', doneResult?.error);
      refreshTodos(tabState.activeWorkDir);
      return;
    }

    const cancelBtn = e.target.closest('.todo-cancel-btn');
    if (cancelBtn) {
      const todoPath = cancelBtn.dataset.todoPath;
      const cancelResult = await window.todo.close(tabState.activeWorkDir, todoPath, 'cancelled');
      if (!cancelResult?.ok) console.error('[Braska] Failed to cancel todo:', cancelResult?.error);
      refreshTodos(tabState.activeWorkDir);
      return;
    }

    const item = e.target.closest('.todo-item');
    if (!item) return;

    const todoPath = item.dataset.path;
    const todoAbsPath = item.dataset.absPath;
    const content = await window.todo.read(tabState.activeWorkDir, todoPath);

    const rendered = escHtml(content)
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/\n\n/g, '<br><br>');

    const isOpen = todoPath.startsWith('open/');
    const ghIssueMatch = content.match(/^## GitHub Issue:\s*#?(\d+)/m);
    const ghIssueLink = ghIssueMatch
      ? `<div class="gh-link-section"><div class="gh-link-row">Linked GitHub Issue: <a data-todo-goto-gh-issue="${ghIssueMatch[1]}">#${ghIssueMatch[1]}</a></div></div>`
      : '';
    todoBody.innerHTML = `
      <div class="todo-detail">
        <div class="todo-detail-header">
          <button class="todo-detail-back" title="Back to todos list">&larr; Todos</button>
        </div>
        <div class="todo-detail-content">${rendered}</div>
        ${ghIssueLink}
        <button class="todo-work-btn" data-todo-path="${escHtml(todoPath)}" data-abs-path="${escHtml(todoAbsPath)}">Work on this todo...</button>
        ${isOpen && getProjectRootForWorkDir(tabState.activeWorkDir) ? `<button class="todo-worktree-btn" data-todo-path="${escHtml(todoPath)}" data-abs-path="${escHtml(todoAbsPath)}">Work on this in a new worktree</button>` : ''}
        ${isOpen ? `<button class="todo-done-btn" data-todo-path="${escHtml(todoPath)}">Done</button><button class="todo-cancel-btn" data-todo-path="${escHtml(todoPath)}">Cancelled</button>` : ''}
      </div>`;
    const ghLink = todoBody.querySelector('[data-todo-goto-gh-issue]');
    if (ghLink) {
      ghLink.addEventListener('click', (ev) => {
        ev.preventDefault();
        const issueNum = parseInt(ghLink.dataset.todoGotoGhIssue);
        _switchToGitHubView(true, { section: 'issues' });
        setTimeout(() => _showGitHubIssueDetail(tabState.activeWorkDir, issueNum), 100);
      });
    }
  });
}

// ── Active todo detection ─────────────────────────────────────

function getActiveTodoNumbers() {
  const projectRoot = getProjectRootForWorkDir(tabState.activeWorkDir);
  if (!projectRoot) return new Set();
  const entry = document.querySelector(`.project-entry[data-path="${CSS.escape(projectRoot)}"]`);
  if (!entry) return new Set();
  const active = new Set();
  for (const el of entry.querySelectorAll('.wt-branch-name')) {
    const match = el.textContent.trim().match(/^todo-(\d+)/);
    if (match) active.add(match[1]);
  }
  // Include todos that have an open tab (even without a worktree branch match)
  for (const tab of tabState.tabs.values()) {
    if (tab.todoNumber && getProjectRootForWorkDir(tab.workDir) === projectRoot) {
      active.add(String(tab.todoNumber));
    }
  }
  return active;
}

// ── Todo close prompt ─────────────────────────────────────────

let _todoCloseResolve = null;

export function showTodoClosePrompt(todoNumber) {
  document.getElementById('todo-close-title').textContent = `Todo #${todoNumber}`;
  document.getElementById('todo-close-modal').classList.add('active');
  return new Promise(resolve => { _todoCloseResolve = resolve; });
}

function closeTodoCloseModal(result) {
  document.getElementById('todo-close-modal').classList.remove('active');
  if (_todoCloseResolve) { _todoCloseResolve(result); _todoCloseResolve = null; }
}

// ── Public functions ───────────────────────────────────────────

export function updateTodoFocus() {
  const activeTab = tabState.tabs.get(tabState.activeTabId);
  const sameProject = activeTab && getProjectRootForWorkDir(activeTab.workDir) === getProjectRootForWorkDir(tabState.activeWorkDir);
  const focusedNum = sameProject ? (activeTab.todoNumber || null) : null;
  for (const el of todoBody.querySelectorAll('.todo-number')) {
    el.classList.toggle('todo-focused', focusedNum != null && el.textContent === `#${focusedNum}`);
  }
}

export async function refreshTodos(workDir) {
  const prevScroll = todoBody.scrollTop;
  const todos = await window.todo.list(workDir);
  const activeTodoNums = getActiveTodoNumbers();

  const openTodos = todos.filter(i => i.status === 'open');
  const doneTodos = todos.filter(i => i.status === 'done');
  const cancelledTodos = todos.filter(i => i.status === 'cancelled');

  let html = '<div class="todo-filter"><input type="text" id="todo-search" placeholder="Filter todos..." /><button class="todo-new-btn" id="todo-new-btn" title="Create a new todo">+ New</button></div>';

  if (openTodos.length > 0) {
    html += `<div class="todo-section-header">Open<span class="changes-section-count">${openTodos.length}</span></div>`;
    for (const todo of openTodos) {
      const num = todo.filename.match(/^(\d+)/)?.[1] || '';
      const activeClass = activeTodoNums.has(num) ? ' todo-active' : '';
      const prioClass = todo.priority ? `todo-priority-${todo.priority.toLowerCase()}` : '';
      html += `<div class="todo-item" data-path="${escHtml(todo.path)}" data-abs-path="${escHtml(todo.absolutePath)}" data-title="${escHtml(todo.title)}" data-todo-num="${num}">
        <span class="todo-number${activeClass}">#${num}</span>
        <span class="todo-title">${escHtml(todo.title)}</span>
        ${todo.type ? `<span class="todo-icon-wrap" title="${escHtml(todo.type)}">${todoTypeIcon(todo.type)}</span>` : ''}
        ${todo.priority ? `<span class="todo-icon-wrap" title="${escHtml(todo.priority)} priority">${todoPriorityIcon(todo.priority)}</span>` : ''}
      </div>`;
    }
  }

  if (doneTodos.length > 0) {
    html += `<div class="todo-section-header">Done<span class="changes-section-count">${doneTodos.length}</span></div>`;
    for (const todo of doneTodos) {
      const num = todo.filename.match(/^(\d+)/)?.[1] || '';
      const activeClass = activeTodoNums.has(num) ? ' todo-active' : '';
      html += `<div class="todo-item" data-path="${escHtml(todo.path)}" data-abs-path="${escHtml(todo.absolutePath)}" data-title="${escHtml(todo.title)}" data-todo-num="${num}" style="opacity:0.6">
        <span class="todo-number${activeClass}">#${num}</span>
        <span class="todo-title">${escHtml(todo.title)}</span>
        ${todo.type ? `<span class="todo-icon-wrap" title="${escHtml(todo.type)}">${todoTypeIcon(todo.type)}</span>` : ''}
        ${todo.priority ? `<span class="todo-icon-wrap" title="${escHtml(todo.priority)} priority">${todoPriorityIcon(todo.priority)}</span>` : ''}
      </div>`;
    }
  }

  if (cancelledTodos.length > 0) {
    html += `<div class="todo-section-header">Cancelled<span class="changes-section-count">${cancelledTodos.length}</span></div>`;
    for (const todo of cancelledTodos) {
      const num = todo.filename.match(/^(\d+)/)?.[1] || '';
      const activeClass = activeTodoNums.has(num) ? ' todo-active' : '';
      html += `<div class="todo-item" data-path="${escHtml(todo.path)}" data-abs-path="${escHtml(todo.absolutePath)}" data-title="${escHtml(todo.title)}" data-todo-num="${num}" style="opacity:0.6">
        <span class="todo-number${activeClass}">#${num}</span>
        <span class="todo-title" style="text-decoration:line-through">${escHtml(todo.title)}</span>
      </div>`;
    }
  }

  if (openTodos.length === 0 && doneTodos.length === 0 && cancelledTodos.length === 0) {
    html += '<div class="todo-empty">No todos found</div>';
  }

  todoBody.innerHTML = html;
  updateTodoFocus();
  todoBody.scrollTop = prevScroll;

  const searchInput = document.getElementById('todo-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const query = searchInput.value.toLowerCase();
      todoBody.querySelectorAll('.todo-item').forEach(el => {
        const title = (el.dataset.title || '').toLowerCase();
        el.style.display = title.includes(query) ? '' : 'none';
      });
    });
  }

  const newTodoBtn = document.getElementById('todo-new-btn');
  if (newTodoBtn) {
    newTodoBtn.addEventListener('click', () => _startTask('todoist', workDir));
  }
}

export function getProjectRootForWorkDir(workDir) {
  const wtEl = document.querySelector(`.worktree-item[data-path="${CSS.escape(workDir)}"]`);
  if (wtEl) {
    const entry = wtEl.closest('.project-entry');
    return entry?.dataset.path || null;
  }
  const projEl = document.querySelector(`.project-entry[data-path="${CSS.escape(workDir)}"]`);
  if (projEl && projEl.classList.contains('is-git')) return workDir;
  return null;
}

export async function workOnTodoInNewWorktree(todoPath, todoAbsPath) {
  const projectRoot = getProjectRootForWorkDir(tabState.activeWorkDir);
  if (!projectRoot) return;

  const content = await window.todo.read(tabState.activeWorkDir, todoPath);
  const titleMatch = content.match(/^# (.+)$/m);
  const todoFilename = todoPath.split('/').pop();
  const todoTitle = titleMatch ? titleMatch[1].trim() : todoFilename.replace(/\.md$/, '');

  const branchName = generateTodoBranchName(todoFilename, todoTitle);
  const parentDir = projectRoot.replace(/\/[^/]+$/, '');
  const projectName = projectRoot.split('/').pop();
  const wtPath = `${parentDir}/${projectName}.worktrees/${branchName}`;

  // Show loading state
  const btn = document.querySelector(`.todo-worktree-btn[data-todo-path="${CSS.escape(todoPath)}"]`);
  if (btn) { btn.disabled = true; btn.textContent = 'Creating worktree...'; }

  const result = await window.worktree.add(projectRoot, wtPath, branchName, true);
  if (!result.ok) {
    if (btn) { btn.disabled = false; btn.textContent = 'Work on this in a new worktree'; }
    let errEl = btn?.parentElement?.querySelector('.todo-worktree-error');
    if (!errEl && btn) {
      errEl = document.createElement('div');
      errEl.className = 'todo-worktree-error';
      btn.insertAdjacentElement('afterend', errEl);
    }
    if (errEl) errEl.textContent = result.error || 'Failed to create worktree.';
    return;
  }

  const projectList = document.getElementById('project-list');
  const entry = projectList.querySelector(`.project-entry[data-path="${CSS.escape(projectRoot)}"]`);
  if (entry) entry.classList.add('expanded');
  await _loadProjects();
  _openWorkDir(wtPath);
  _showAgentPickerForTodo(wtPath, todoPath, todoAbsPath);
}
