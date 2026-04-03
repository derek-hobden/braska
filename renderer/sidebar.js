// Sidebar — project list rendering, expand/collapse, worktree metrics

import { SVG_OCTOCAT, SVG_GIT_LOGO, SVG_FOLDER, SVG_GIT_BRANCH } from './utils.js';
import { updateNotifUI } from './notifications.js';

// ── DOM refs (queried once at module level) ──
const projectList = document.getElementById('project-list');
const addBtn = document.getElementById('add-project-btn');

// ── Cross-module deps (injected via initSidebar to avoid circular imports) ──
let _openWorkDir;
let _openWorktreeCreateModal;
let _showWorktreeContextMenu;

// ── Functions ──────────────────────────────────────────────────

export function renderProjects(projects) {
  if (projects.length === 0) {
    projectList.innerHTML = '<div id="empty-sidebar">No projects yet.<br>Click + to add a folder.</div>';
    return;
  }
  projectList.innerHTML = projects.map(p => {
    const esc = p.path.replace(/"/g, '&quot;');
    const projectIcon = p.isGitHub
      ? `<span class="expand-icon">${SVG_OCTOCAT}</span>`
      : p.isGit
        ? `<span class="expand-icon" style="color:#f05033">${SVG_GIT_LOGO}</span>`
        : `<span class="expand-icon" style="color:#e8c882">${SVG_FOLDER}</span>`;
    const worktrees = p.isGit && p.worktrees.length ? '<div class="worktree-list">' + p.worktrees.map(w => {
      const wtPath = (w.path || '').replace(/"/g, '&quot;');
      const lockIcon = w.isLocked ? '<span class="wt-lock-icon" title="Locked">&#128274;</span>' : '';
      const mainAttr = w.isMain ? ' data-is-main="true"' : '';
      const lockedAttr = w.isLocked ? ' data-is-locked="true"' : '';
      return `<div class="worktree-item" data-path="${wtPath}"${mainAttr}${lockedAttr}><span class="wt-icon">${SVG_GIT_BRANCH}</span><span class="wt-branch-name">${w.branch || '(unknown)'}${lockIcon}</span><span class="wt-metrics" data-wt-path="${wtPath}"></span></div>`;
    }).join('') + `<div class="worktree-add-btn" data-project="${esc}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add worktree</div></div>` : '';
    return `
      <div class="project-entry${p.isGit ? ' is-git' : ''}" data-path="${esc}">
        <div class="project-item">
          ${projectIcon}
          <div class="project-info">
            <div class="project-name-row">
              <div class="project-name">${p.name}</div>
            </div>
            <div class="project-path">${p.path}</div>
          </div>
          <button class="remove-btn" title="Remove project">&times;</button>
        </div>
        ${worktrees}
      </div>
    `;
  }).join('');
}

export async function loadProjects() {
  // Preserve expanded state across re-renders
  const expandedPaths = new Set();
  projectList.querySelectorAll('.project-entry.expanded').forEach(el => expandedPaths.add(el.dataset.path));
  const projects = await window.projects.list();
  renderProjects(projects);
  // Restore expanded state
  expandedPaths.forEach(p => {
    const entry = projectList.querySelector(`.project-entry[data-path="${CSS.escape(p)}"]`);
    if (entry) entry.classList.add('expanded');
  });
  refreshWorktreeMetrics();
}

export async function refreshWorktreeMetrics() {
  const entries = projectList.querySelectorAll('.project-entry.is-git');
  for (const entry of entries) {
    const projectPath = entry.dataset.path;
    try {
      const metrics = await window.worktree.metrics(projectPath);
      for (const m of metrics) {
        const el = entry.querySelector(`.wt-metrics[data-wt-path="${CSS.escape(m.path)}"]`);
        if (!el) continue;
        const badges = [];
        if (m.changed > 0) badges.push(`<span class="wt-metric changed" title="${m.changed} changed">${m.changed}M</span>`);
        if (m.untracked > 0) badges.push(`<span class="wt-metric untracked" title="${m.untracked} untracked">${m.untracked}U</span>`);
        if (m.ahead > 0) badges.push(`<span class="wt-metric ahead" title="${m.ahead} ahead of main">${m.ahead}&#8593;</span>`);
        if (m.behind > 0) badges.push(`<span class="wt-metric behind" title="${m.behind} behind main">${m.behind}&#8595;</span>`);
        el.innerHTML = badges.join('');
      }
    } catch {}
  }
}

// ── Init (wires up event listeners, avoids circular imports) ──

export function initSidebar({ openWorkDir, openWorktreeCreateModal, showWorktreeContextMenu }) {
  _openWorkDir = openWorkDir;
  _openWorktreeCreateModal = openWorktreeCreateModal;
  _showWorktreeContextMenu = showWorktreeContextMenu;

  addBtn.addEventListener('click', async () => {
    const result = await window.projects.add();
    if (result) loadProjects();
  });

  projectList.addEventListener('click', async (e) => {
    const removeBtn = e.target.closest('.remove-btn');
    if (removeBtn) {
      const entry = removeBtn.closest('.project-entry');
      const projectPath = entry.dataset.path;
      await window.projects.remove(projectPath);
      await loadProjects();
      return;
    }
    // "Add worktree" button click
    const addWtBtn = e.target.closest('.worktree-add-btn');
    if (addWtBtn) {
      const projectPath = addWtBtn.dataset.project;
      _openWorktreeCreateModal(projectPath);
      return;
    }
    // Worktree click → switch to its tabs or show launchpad
    const worktreeItem = e.target.closest('.worktree-item');
    if (worktreeItem) {
      _openWorkDir(worktreeItem.dataset.path);
      return;
    }
    const item = e.target.closest('.project-item');
    if (item) {
      const entry = item.closest('.project-entry');
      if (entry && entry.classList.contains('is-git')) {
        entry.classList.toggle('expanded');
        updateNotifUI();
      } else if (entry) {
        _openWorkDir(entry.dataset.path);
      }
    }
  });

  // Right-click context menu on worktree items
  projectList.addEventListener('contextmenu', (e) => {
    const worktreeItem = e.target.closest('.worktree-item');
    if (!worktreeItem) return;
    e.preventDefault();
    _showWorktreeContextMenu(e.clientX, e.clientY, worktreeItem);
  });

  // Initial load
  loadProjects();
}
