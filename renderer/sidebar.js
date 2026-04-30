// Sidebar — project list rendering, expand/collapse, worktree metrics, project-scope links

import { SVG_FOLDER, SVG_GIT_BRANCH, divergenceBadges } from './utils.js';
import { updateNotifUI } from './notifications.js';
import { openCloneModal } from './clone-modal.js';

// ── DOM refs (queried once at module level) ──
const projectList = document.getElementById('project-list');
const addBtn = document.getElementById('add-project-btn');

// ── Cross-module deps (injected via initSidebar to avoid circular imports) ──
let _openWorkDir;
let _openWorktreeCreateModal;
let _showWorktreeContextMenu;
let _openProjectScope;

// ── SVG icons for section links ──
const SVG_TODO = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
const SVG_GITHUB = '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';

// ── Functions ──────────────────────────────────────────────────

export function renderProjects(projects) {
  if (projects.length === 0) {
    projectList.innerHTML = '<div id="empty-sidebar">No projects yet.<br>Click + to add a folder.</div>';
    return;
  }
  projectList.innerHTML = projects.map(p => {
    const esc = p.path.replace(/"/g, '&quot;');
    const projectIcon = `<span class="expand-icon" style="color:#e8c882">${SVG_FOLDER}</span>`;
    const worktrees = p.isGit && p.worktrees.length ? '<div class="worktree-list">' + p.worktrees.map(w => {
      const wtPath = (w.path || '').replace(/"/g, '&quot;');
      const lockIcon = w.isLocked ? '<span class="wt-lock-icon" title="Locked">&#128274;</span>' : '';
      const mainAttr = w.isMain ? ' data-is-main="true"' : '';
      const lockedAttr = w.isLocked ? ' data-is-locked="true"' : '';
      const todoMatch = (w.branch || '').match(/^todo-(\d+)/);
      const todoNumAttr = todoMatch ? ` data-todo-num="${todoMatch[1]}"` : '';
      return `<div class="worktree-item" data-path="${wtPath}"${mainAttr}${lockedAttr}${todoNumAttr}><span class="wt-icon">${SVG_GIT_BRANCH}</span><span class="wt-branch-name">${w.branch || '(unknown)'}${lockIcon}</span><span class="wt-metrics" data-wt-path="${wtPath}"></span></div>`;
    }).join('') + `<div class="worktree-add-btn" data-project="${esc}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add worktree</div></div>` : '';
    // Project-level section links (available without picking a worktree)
    const sectionLinks = p.isGit ? `<div class="project-sections">
      <div class="project-section-sep"></div>
      <div class="project-section-link" data-project="${esc}" data-section="todos">
        ${SVG_TODO}
        <span>Todos</span>
        <span class="project-section-badge" data-badge="todos"></span>
      </div>
      <div class="project-section-link" data-project="${esc}" data-section="github">
        ${SVG_GITHUB}
        <span>GitHub</span>
        <span class="project-section-badge" data-badge="github"></span>
      </div>
    </div>` : '';
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
        ${sectionLinks}
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
  refreshAllProjectBadges();
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
        const fileBadges = [];
        if (m.changed > 0) fileBadges.push(`<span class="wt-metric changed" title="${m.changed} changed file${m.changed > 1 ? 's' : ''}">${m.changed}M</span>`);
        if (m.untracked > 0) fileBadges.push(`<span class="wt-metric untracked" title="${m.untracked} new file${m.untracked > 1 ? 's' : ''}">${m.untracked}U</span>`);
        const { html: divHtml } = divergenceBadges(m, 'wt-metric');
        // Stale-main indicator — only on the main worktree row, when origin has advanced
        let staleHtml = '';
        if (m.isMain && m.mainStale?.originAhead > 0) {
          const n = m.mainStale.originAhead;
          staleHtml = `<span class="wt-metric stale" title="${n} new commit${n !== 1 ? 's' : ''} on origin/${m.mainStale.branch} — pull to update">&#8659;${n}</span>`;
        }
        el.innerHTML = fileBadges.join('') + divHtml + staleHtml;
      }
    } catch {}
  }
}

// ── Badge refresh for project-level section links ──

function refreshAllProjectBadges() {
  const entries = projectList.querySelectorAll('.project-entry.is-git');
  for (const entry of entries) refreshProjectBadges(entry.dataset.path);
}

export async function refreshProjectBadges(projectPath) {
  const entry = projectList.querySelector(`.project-entry[data-path="${CSS.escape(projectPath)}"]`);
  if (!entry) return;

  // Find the main worktree path to use as workDir for IPC calls
  const mainWt = entry.querySelector('.worktree-item[data-is-main="true"]');
  const workDir = mainWt ? mainWt.dataset.path : projectPath;

  // Todo count badge
  const todoBadge = entry.querySelector('[data-badge="todos"]');
  if (todoBadge) {
    try {
      const todos = await window.todo.list(workDir);
      const openCount = todos.filter(t => t.status === 'open').length;
      todoBadge.textContent = openCount > 0 ? String(openCount) : '';
      todoBadge.classList.toggle('has-count', openCount > 0);
    } catch { todoBadge.textContent = ''; }
  }

  // GitHub activity dot
  const ghBadge = entry.querySelector('[data-badge="github"]');
  if (ghBadge) {
    try {
      const notifs = await window.github.notifications(workDir);
      const hasActivity = notifs.ok && notifs.data && notifs.data.length > 0;
      ghBadge.classList.toggle('has-activity', hasActivity);
      ghBadge.textContent = '';
    } catch { ghBadge.classList.remove('has-activity'); }
  }
}

// ── Init (wires up event listeners, avoids circular imports) ──

export function initSidebar({ openWorkDir, openWorktreeCreateModal, showWorktreeContextMenu, openProjectScope }) {
  _openWorkDir = openWorkDir;
  _openWorktreeCreateModal = openWorktreeCreateModal;
  _showWorktreeContextMenu = showWorktreeContextMenu;
  _openProjectScope = openProjectScope;

  const addMenu = document.getElementById('add-project-menu');
  function closeAddMenu() { addMenu.classList.remove('active'); }

  addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (addMenu.classList.contains('active')) { closeAddMenu(); return; }
    const rect = addBtn.getBoundingClientRect();
    addMenu.style.top = `${rect.bottom + 4}px`;
    addMenu.style.left = `${rect.left}px`;
    addMenu.classList.add('active');
  });

  addMenu.addEventListener('click', async (e) => {
    const item = e.target.closest('.add-project-menu-item');
    if (!item) return;
    closeAddMenu();
    if (item.dataset.action === 'open-folder') {
      const result = await window.projects.add();
      if (result) loadProjects();
    } else if (item.dataset.action === 'clone-github') {
      openCloneModal();
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#add-project-menu') && !e.target.closest('#add-project-btn')) closeAddMenu();
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
    // Project section link click (Todos / GitHub)
    const sectionLink = e.target.closest('.project-section-link');
    if (sectionLink) {
      _openProjectScope(sectionLink.dataset.project, sectionLink.dataset.section);
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
        // Refresh badges when expanding
        if (entry.classList.contains('expanded')) refreshProjectBadges(entry.dataset.path);
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
