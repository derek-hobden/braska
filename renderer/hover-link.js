// 3-way hover glow linking worktree items, todo items, and tabs.
// Hovering any one highlights the linked items in the other two panels with gold text.

import { tabState } from './state.js';

const CLS = 'hover-glow-linked';

let glowing = [];

function clearGlow() {
  for (const el of glowing) el.classList.remove(CLS);
  glowing = [];
}

function addGlow(el) {
  el.classList.add(CLS);
  glowing.push(el);
}

function isTodoPanelVisible() {
  const tab = document.querySelector('.filetree-tab.active');
  return tab?.dataset.panel === 'todo' &&
    !document.getElementById('filetree-panel').classList.contains('hidden');
}

function isSidebarVisible() {
  return !document.getElementById('sidebar').classList.contains('collapsed');
}

// Glow all elements linked to a todo number (except the source element)
function glowLinked(todoNum, sourceEl) {
  const esc = CSS.escape(todoNum);
  const projectList = document.getElementById('project-list');
  const todoBody = document.getElementById('todo-body');
  const termHeader = document.getElementById('terminal-header');

  if (isTodoPanelVisible()) {
    const todo = todoBody.querySelector(`.todo-item[data-todo-num="${esc}"]`);
    if (todo && todo !== sourceEl) addGlow(todo);
  }
  const matchedTabs = termHeader.querySelectorAll(`.term-tab[data-todo-num="${esc}"]`);
  for (const el of matchedTabs) {
    if (el !== sourceEl) addGlow(el);
  }
  if (isSidebarVisible()) {
    // Glow worktrees with matching branch name
    for (const el of projectList.querySelectorAll(`.worktree-item[data-todo-num="${esc}"]`)) {
      if (el !== sourceEl) addGlow(el);
    }
    // Also glow worktrees hosting a matching tab (covers todos worked on from main)
    const glowedPaths = new Set(glowing.filter(el => el.classList.contains('worktree-item')).map(el => el.dataset.path));
    for (const tabEl of matchedTabs) {
      const tab = tabState.tabs.get(Number(tabEl.dataset.id));
      if (!tab || glowedPaths.has(tab.workDir)) continue;
      const wt = projectList.querySelector(`.worktree-item[data-path="${CSS.escape(tab.workDir)}"]`);
      if (wt && wt !== sourceEl) addGlow(wt);
    }
  }
}

function handleOver(e, selector) {
  const item = e.target.closest(selector);
  if (!item) return null;
  clearGlow();
  const num = item.dataset.todoNum;
  if (num) glowLinked(num, item);
  return item;
}

function handleOut(e, selector) {
  const item = e.target.closest(selector);
  if (item && !item.contains(e.relatedTarget)) clearGlow();
}

export function initHoverLink() {
  const projectList = document.getElementById('project-list');
  const todoBody = document.getElementById('todo-body');
  const termHeader = document.getElementById('terminal-header');

  projectList.addEventListener('mouseover', (e) => handleOver(e, '.worktree-item'));
  projectList.addEventListener('mouseout', (e) => handleOut(e, '.worktree-item'));

  todoBody.addEventListener('mouseover', (e) => handleOver(e, '.todo-item'));
  todoBody.addEventListener('mouseout', (e) => handleOut(e, '.todo-item'));

  termHeader.addEventListener('mouseover', (e) => handleOver(e, '.term-tab'));
  termHeader.addEventListener('mouseout', (e) => handleOut(e, '.term-tab'));
}
