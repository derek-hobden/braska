// ── Git Changes panel — status, staging, commit toolbar ─────────
import { tabState, gitState, ghState } from './state.js';
import { escHtml, statSpan, createChangeEntryEl } from './utils.js';
import { reconcileChildren, patchText, patchHtml } from './dom-patch.js';
import { initChangesModals, doPullLatestMain, openBranchModal, openDiffTab } from './git-changes-modals.js';
import { initChangesActions } from './git-changes-actions.js';
import { initTreeToggle, renderTreeEntries } from './git-changes-tree.js';
import { computeGraph, renderFullGraphSvg, createCommitEl, createStashEl, GRAPH_ROW_H, GRAPH_COL_W } from './git-changes-graph.js';
import { showChangesStatus } from './git-changes-status.js';
import { renderJourneyZone, getCachedPRPillHtml } from './journey-zone.js';

// ── Cross-module deps (injected via initGitChanges) ────────────
let _refreshFileTree = null;
let _startTask = null;
let _loadProjects = null;

export function initGitChanges({ refreshFileTree, startTask, loadProjects, switchTab, addTabToOrder, renderTabBar, tabsForWorkDir }) {
  _refreshFileTree = refreshFileTree;
  _startTask = startTask;
  _loadProjects = loadProjects;

  // Forward deps to modals sub-module
  initChangesModals({
    refreshChanges, showChangesStatus, stageAndPromptCommit, refreshWorktreeMetrics,
    startTask, loadProjects, switchTab, addTabToOrder, renderTabBar,
  });

  initChangesActions({
    refreshChanges, showChangesStatus, refreshWorktreeMetrics,
    openDiffTab, startTask, changesBody, commitsBody,
  });
  initTreeToggle(gitState, () => tabState.activeWorkDir, refreshChanges);
}

// Re-export for app.js
export { doPullLatestMain, openBranchModal, openDiffTab };

// ── GitHub view mode (inline within the unified panel) ─────────
let _refreshGitHub = null;
let _switchRightPanelTab = null;

export function initGitHubViewBridge({ refreshGitHub, switchRightPanelTab }) {
  _refreshGitHub = refreshGitHub;
  _switchRightPanelTab = switchRightPanelTab;
}

const changesBody = document.getElementById('changes-body');
const commitsBody = document.getElementById('commits-body');

export function switchToGitHubView(activate = true, { section } = {}) {
  if (section) ghState.section = section;
  if (activate && _switchRightPanelTab) _switchRightPanelTab('github');
  else if (!activate && _switchRightPanelTab) _switchRightPanelTab('changes');
}

// ── Post-commit prompt bridge (legacy) ──
export function initPostCommitPromptBridge() {}

// ── DOM refs ────────────────────────────────────────────────────
gitState.changesTreeView = localStorage.getItem('braska-changes-tree-view') === 'true';

const branchSubtitleEl = document.getElementById('branch-subtitle');

// ── Helper: update branch subtitle with divergence info ─────────
function updateMainDivergence(status) {
  if (!branchSubtitleEl) return;
  const div = status?.mainDivergence;
  const stale = status?.mainStale;
  const onMain = stale && status?.branch === stale.branch;
  const parts = [];
  if (div?.ahead > 0) parts.push(`<span class="branch-ahead">${div.ahead} ahead</span>`);
  if (div?.behind > 0) parts.push(`<span class="branch-behind">${div.behind} behind main</span>`);
  if (div?.pushAhead > 0) parts.push(`<span class="branch-unpushed">${div.pushAhead} unpushed</span>`);
  if (div?.pushBehind > 0) parts.push(`<span class="branch-unpulled">${div.pushBehind} unpulled</span>`);
  // Local main is stale vs origin/main. On main itself this duplicates pushBehind,
  // so only surface it when on a feature branch.
  if (!onMain && stale?.originAhead > 0) {
    const n = stale.originAhead;
    parts.push(`<span class="branch-stale" title="Local ${stale.branch} is ${n} commit${n !== 1 ? 's' : ''} behind origin/${stale.branch}. Pull latest main to refresh.">main is ${n} behind origin</span>`);
  }
  const prPill = getCachedPRPillHtml(tabState.activeWorkDir, status?.branch);
  if (prPill) parts.push(prPill);
  branchSubtitleEl.innerHTML = parts.join(' · ');
}

// ── Helper: refreshWorktreeMetrics (imported from sidebar) ──────
async function refreshWorktreeMetrics() {
  const { refreshWorktreeMetrics: fn } = await import('./sidebar.js');
  return fn();
}

// Re-export showChangesStatus (now lives in git-changes-status.js)
export { showChangesStatus };

// ── Stage & prompt ──────────────────────────────────────────────
export async function stageAndPromptCommit(path, dirtyCount) {
  if (!dirtyCount || dirtyCount <= 0) return 'cancelled';
  if (!confirm(`${dirtyCount} uncommitted change${dirtyCount !== 1 ? 's' : ''}. Stage all changes? You'll need to commit before pulling main.`)) {
    return 'cancelled';
  }
  const stageResult = await window.gitOps.stageAll(path);
  if (!stageResult.ok) {
    return 'error';
  }
  const changesTab = document.querySelector('.filetree-tab[data-panel="changes"]');
  if (changesTab) {
    changesTab.classList.add('attention');
    clearTimeout(gitState._stageAttentionTimeout);
    gitState._stageAttentionTimeout = setTimeout(() => changesTab.classList.remove('attention'), 3000);
  }
  refreshChanges(path);
  return 'ok';
}

// ── Generation counter — prevents stale IPC data from overwriting fresh data ──
let _refreshGen = 0;

// ── Action button HTML fragments (reused across renders) ────────
const UNSTAGE_BTN = '<button class="changes-file-action changes-unstage" title="Unstage">&minus;</button>';
const STAGE_BTN = '<button class="changes-file-action changes-stage" title="Stage">+</button>';
const DISCARD_BTN = '<button class="changes-file-action changes-discard" title="Discard changes">↺</button>';
const ACTION_PLACEHOLDER = '<span class="changes-action-placeholder"></span>';

// ── Badge class lookup ──────────────────────────────────────────
const BADGE_CLASS = { M: 'changes-badge-m', A: 'changes-badge-a', D: 'changes-badge-d', R: 'changes-badge-r', C: 'changes-badge-c', U: 'changes-badge-u', '?': 'changes-badge-q' };
const badgeCls = (status) => BADGE_CLASS[status] || 'changes-badge-m';

// ── Section definitions ─────────────────────────────────────────
const SECTION_DEFS = {
  staged: {
    label: 'Staged',
    actions: '<span class="changes-header-actions"><button class="changes-section-action-icon unstage-all" title="Unstage all">&minus;</button><span class="changes-action-placeholder"></span></span>',
    entryFn: (f) => createChangeEntryEl(f.file, f.status, badgeCls(f.status), { file: f.file, staged: 'true' }, statSpan(f.added, f.deleted), UNSTAGE_BTN, ACTION_PLACEHOLDER),
    getPath: (f) => f.file,
  },
  unstaged: {
    label: 'Changes',
    actions: '<span class="changes-header-actions"><button class="changes-section-action-icon stage-all-unstaged" title="Stage all changes">+</button><button class="changes-section-action-icon discard-all-unstaged" title="Discard all changes">↺</button></span>',
    entryFn: (f) => createChangeEntryEl(f.file, f.status, badgeCls(f.status), { file: f.file, staged: 'false' }, statSpan(f.added, f.deleted), STAGE_BTN, DISCARD_BTN),
    getPath: (f) => f.file,
  },
  untracked: {
    label: 'Untracked',
    actions: '<span class="changes-header-actions"><button class="changes-section-action-icon stage-all-untracked" title="Stage all untracked">+</button><span class="changes-action-placeholder"></span></span>',
    entryFn: (f) => createChangeEntryEl(f, '?', 'changes-badge-q', { file: f, untracked: 'true' }, '<span class="changes-added">new</span>', STAGE_BTN, ACTION_PLACEHOLDER),
    getPath: (f) => f,
  },
};

function createSectionEl(sec) {
  const el = document.createElement('div');
  el.className = 'changes-section';
  const def = SECTION_DEFS[sec.key];
  if (def) {
    el.innerHTML = `<div class="changes-section-header">${def.label}<span class="changes-section-count">${sec.items.length}</span>${def.actions}</div>`;
    const entries = document.createElement('div');
    entries.className = 'changes-section-entries';
    if (gitState.changesTreeView) {
      renderTreeEntries(entries, sec.items, def.entryFn, def.getPath);
    } else {
      for (const item of sec.items) entries.appendChild(def.entryFn(item));
    }
    el.appendChild(entries);
  } else if (sec.key === 'stashes') {
    el.innerHTML = `<div class="changes-section-header">Stashes<span class="changes-section-count">${sec.items.length}</span></div>`;
    const entries = document.createElement('div');
    entries.className = 'changes-section-entries';
    for (let i = 0; i < sec.items.length; i++) entries.appendChild(createStashEl(sec.items[i], i));
    el.appendChild(entries);
  } else if (sec.key === 'commits') {
    const collapsed = localStorage.getItem('braska-commits-collapsed') === 'true';
    if (collapsed) el.classList.add('commits-collapsed');
    el.innerHTML = `<div class="changes-section-header changes-section-collapsible${collapsed ? ' collapsed' : ''}"><span class="changes-section-chevron">${collapsed ? '▸' : '▾'}</span>Recent Commits<span class="changes-section-count">${sec.items.length}</span></div>`;
    const entries = document.createElement('div');
    entries.className = 'changes-section-entries commits-graph-wrap';
    if (collapsed) entries.style.display = 'none';
    const graph = computeGraph(sec.items);
    const graphW = (graph.maxLanes + 1) * GRAPH_COL_W;
    entries.innerHTML = renderFullGraphSvg(graph);
    entries.style.paddingLeft = graphW + 'px';
    for (const c of sec.items) entries.appendChild(createCommitEl(c));
    el.appendChild(entries);
  } else {
    el.innerHTML = '<div class="changes-empty">No changes</div>';
  }
  return el;
}

function updateSectionEl(el, sec) {
  const def = SECTION_DEFS[sec.key];
  if (def) {
    patchText(el, '.changes-section-count', String(sec.items.length));
    const entries = el.querySelector('.changes-section-entries');
    if (gitState.changesTreeView) {
      entries.innerHTML = '';
      renderTreeEntries(entries, sec.items, def.entryFn, def.getPath);
    } else {
      if (entries.querySelector('.changes-tree-group')) entries.innerHTML = '';
      reconcileChildren(entries, sec.items, 'file',
        item => typeof item === 'string' ? item : item.file,
        item => def.entryFn(item),
        (existing, item) => {
          const f = typeof item === 'string' ? item : item;
          if (f.added !== undefined) patchHtml(existing, '.changes-file-stats', statSpan(f.added, f.deleted));
        },
      );
    }
  } else if (sec.key === 'stashes') {
    patchText(el, '.changes-section-count', String(sec.items.length));
    const entries = el.querySelector('.changes-section-entries');
    // Stashes shift indexes on pop — rebuild entries
    entries.innerHTML = '';
    for (let i = 0; i < sec.items.length; i++) entries.appendChild(createStashEl(sec.items[i], i));
  } else if (sec.key === 'commits') {
    patchText(el, '.changes-section-count', String(sec.items.length));
    const entries = el.querySelector('.changes-section-entries');

    // Capture expanded commits (with their loaded file lists) before rebuild
    const expandedMap = new Map();
    for (const commitEl of entries.querySelectorAll('.changes-commit.expanded')) {
      const filesEl = commitEl.querySelector('.changes-commit-files');
      if (filesEl && filesEl.children.length > 0) {
        expandedMap.set(commitEl.dataset.hash, filesEl);
      }
    }

    const graph = computeGraph(sec.items);
    const graphW = (graph.maxLanes + 1) * GRAPH_COL_W;
    entries.innerHTML = renderFullGraphSvg(graph);
    entries.style.paddingLeft = graphW + 'px';
    for (const c of sec.items) {
      const newEl = createCommitEl(c);
      if (expandedMap.has(c.hash)) {
        newEl.classList.add('expanded');
        // Re-attach the previously loaded file list
        const newFilesEl = newEl.querySelector('.changes-commit-files');
        const oldFilesEl = expandedMap.get(c.hash);
        newFilesEl.replaceWith(oldFilesEl);
      }
      entries.appendChild(newEl);
    }
  }
}

// createStashEl, createCommitEl, computeGraph, renderFullGraphSvg,
// GRAPH_ROW_H, GRAPH_COL_W — now imported from git-changes-graph.js

// ── Main refresh (incremental) ──────────────────────────────────
export async function refreshChanges(workDir) {
  try { return await _refreshChangesInner(workDir); }
  catch (err) {
    console.error('[Braska] refreshChanges error:', err);
    changesBody.innerHTML = `<div class="changes-empty" style="color:#f85149">Error: ${escHtml(err.message)}</div>`;
  }
}

async function _refreshChangesInner(workDir) {
  const gen = ++_refreshGen;
  const scrollTop = changesBody.scrollTop;

  // Show loading only on first render (no existing sections)
  if (!changesBody.querySelector('[data-section]')) {
    changesBody.innerHTML = '<div class="changes-empty">Loading...</div>';
  }

  const [status, commits, stashes] = await Promise.all([
    window.gitDiff.status(workDir),
    window.gitDiff.log(workDir, 20),
    window.gitDiff.stashList(workDir),
  ]);

  // Bail if a newer refresh started while we were waiting
  if (gen !== _refreshGen) return;

  if (!status.isGit) {
    // Hide branch header + journey zone for non-git
    document.getElementById('branch-header').style.display = 'none';
    document.getElementById('journey-zone').style.display = 'none';
    commitsBody.style.display = 'none';
    changesBody.innerHTML = `<div class="changes-not-git">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>
      <div class="changes-not-git-title">Not a git repository</div>
      <div class="changes-not-git-subtitle">Initialize a repository to track changes, create branches, and collaborate.</div>
      <button class="changes-not-git-btn">Initialize Repository</button>
    </div>`;
    // innerHTML replaces entire subtree, so old listeners are GC'd with old nodes — safe to re-attach
    changesBody.querySelector('.changes-not-git-btn').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Initializing…';
      const result = await window.gitOps.init(workDir);
      if (result.ok) {
        if (_loadProjects) _loadProjects();
        refreshChanges(workDir);
      } else {
        btn.disabled = false;
        btn.textContent = 'Initialize Repository';
        showChangesStatus(result.error, 'error');
      }
    });
    return;
  }

  // Show branch header + commits body (may have been hidden by non-git state)
  document.getElementById('branch-header').style.display = '';
  commitsBody.style.display = '';

  // Update main divergence indicator + branch subtitle
  updateMainDivergence(status);

  // Render journey zone cards based on current state
  renderJourneyZone(status);

  // Update branch header
  const branchNameBtn = document.getElementById('branch-name-btn');
  if (branchNameBtn && status.branch) branchNameBtn.textContent = status.branch;

  // Remove loading placeholder (unkeyed, invisible to reconciler)
  const loadingEl = changesBody.querySelector('.changes-empty');
  if (loadingEl) loadingEl.remove();

  // Build section descriptors — file changes go in changesBody, commits/stashes in commitsBody
  const fileSections = [];
  if (status.staged.length) fileSections.push({ key: 'staged', items: status.staged });
  if (status.unstaged.length) fileSections.push({ key: 'unstaged', items: status.unstaged });
  if (status.untracked.length) fileSections.push({ key: 'untracked', items: status.untracked });
  if (!fileSections.length) fileSections.push({ key: 'empty', items: [] });

  reconcileChildren(changesBody, fileSections, 'section',
    sec => sec.key,
    sec => createSectionEl(sec),
    (el, sec) => updateSectionEl(el, sec),
  );
  changesBody.scrollTop = scrollTop;

  // Commits + stashes go in the Commits sub-view
  const commitSections = [];
  if (stashes.length) commitSections.push({ key: 'stashes', items: stashes });
  if (commits.length) commitSections.push({ key: 'commits', items: commits });
  if (!commitSections.length) commitSections.push({ key: 'empty', items: [] });

  reconcileChildren(commitsBody, commitSections, 'section',
    sec => sec.key,
    sec => createSectionEl(sec),
    (el, sec) => updateSectionEl(el, sec),
  );
}

// Toolbar listener functions removed — all actions now handled by journey-zone.js

// ── Shared push logic (used by toolbar + post-commit banner) ───
function onPushSuccess(workDir, msg = 'Pushed') {
  showChangesStatus(msg, 'success');
  gitState.postCommitPrompts.delete(workDir);
  refreshChanges(workDir);
  refreshWorktreeMetrics();
  return { ok: true };
}

export async function doPush(workDir, { autoUpstream = false } = {}) {
  const result = await window.gitOps.push(workDir);
  if (result.ok) return onPushSuccess(workDir);
  if (result.noUpstream) {
    if (autoUpstream) {
      const branch = await window.gitDiff.currentBranch(workDir);
      const upResult = await window.gitOps.pushSetUpstream(workDir, branch);
      if (upResult.ok) return onPushSuccess(workDir, 'Pushed (upstream set)');
      showChangesStatus('Push failed: ' + (upResult.error || '').split('\n')[0], 'error');
      return { ok: false, error: upResult.error };
    }
    // Interactive: ask user to confirm upstream
    const branch = await window.gitDiff.currentBranch(workDir);
    if (branch && confirm(`No upstream branch. Push and set upstream to origin/${branch}?`)) {
      const upResult = await window.gitOps.pushSetUpstream(workDir, branch);
      if (upResult.ok) return onPushSuccess(workDir, 'Pushed (upstream set)');
      showChangesStatus('Push failed: ' + (upResult.error || '').split('\n')[0], 'error');
      return { ok: false, error: upResult.error };
    }
    showChangesStatus('Push cancelled', 'info');
    return { ok: false, cancelled: true };
  }
  showChangesStatus('Push failed: ' + (result.error || '').split('\n')[0], 'error');
  return { ok: false, error: result.error };
}

// Push/stash toolbar listeners removed — now in journey-zone.js
