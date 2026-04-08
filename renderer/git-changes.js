// ── Git Changes panel — status, staging, commit toolbar ─────────
import { tabState, gitState } from './state.js';
import { escHtml, statSpan, createChangeEntryEl, divergenceBadges } from './utils.js';
import { reconcileChildren, patchText, patchHtml } from './dom-patch.js';
import { initChangesModals, doPullLatestMain, openBranchModal, openDiffTab } from './git-changes-modals.js';
import { initChangesActions } from './git-changes-actions.js';
import { initTreeToggle, renderTreeEntries } from './git-changes-tree.js';

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

  _initCommitChangesListener();
  _initFetchListener();
  _initPullListener();
  _initPushListener();
  _initStashToolbarListener();
  initChangesActions({
    refreshChanges, showChangesStatus, refreshWorktreeMetrics,
    openDiffTab, startTask, changesBody,
  });
  initTreeToggle(gitState, () => tabState.activeWorkDir, refreshChanges);
}

// Re-export for app.js
export { doPullLatestMain, openBranchModal, openDiffTab };

// ── Post-commit prompt integration ─────────────────────────────
let _buildPostCommitSection = null;
let _dismissPostCommitPrompt = null;

export function initPostCommitPromptBridge({ buildPostCommitSection, dismissPostCommitPrompt }) {
  _buildPostCommitSection = buildPostCommitSection;
  _dismissPostCommitPrompt = dismissPostCommitPrompt;
}

// ── DOM refs (queried once per session) ─────────────────────────
// Initialize tree view preference from localStorage
gitState.changesTreeView = localStorage.getItem('braska-changes-tree-view') === 'true';

const changesBody = document.getElementById('changes-body');
const changesToolbar = document.getElementById('changes-toolbar');
const changesCommitArea = document.getElementById('changes-commit-area');
const changesCommitChangesBtn = document.getElementById('changes-commit-changes-btn');
const changesReviewBtn = document.getElementById('changes-review-btn');
const changesReviewLoopBtn = document.getElementById('changes-review-loop-btn');
const mainDivergenceEl = document.getElementById('changes-main-divergence');

// ── Helper: main divergence badge next to pull-main button ─────
function updateMainDivergence(div) {
  if (!div) { mainDivergenceEl.innerHTML = ''; return; }
  const { html, title } = divergenceBadges(div);
  mainDivergenceEl.innerHTML = html;
  mainDivergenceEl.title = title;
}

// ── Helper: refreshWorktreeMetrics (imported from sidebar) ──────
async function refreshWorktreeMetrics() {
  const { refreshWorktreeMetrics: fn } = await import('./sidebar.js');
  return fn();
}

// ── Status toast ────────────────────────────────────────────────
export function showChangesStatus(msg, type) {
  const el = document.getElementById('changes-toolbar-status');
  el.textContent = msg;
  el.className = 'changes-toolbar-status ' + type;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.textContent = ''; el.className = 'changes-toolbar-status'; }, type === 'error' ? 8000 : 4000);
}

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
  if (sec.key === 'post-commit-prompt') return _buildPostCommitSection(sec.items[0].workDir, sec.items[0].status, null);
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
  if (sec.key === 'post-commit-prompt') {
    // Mutate in-place to keep el reference valid for the DOM reconciler
    const newEl = _buildPostCommitSection(sec.items[0].workDir, sec.items[0].status, null);
    el.replaceChildren(...newEl.childNodes);
    el.className = newEl.className;
    return;
  }
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

function createStashEl(s, i) {
  const el = document.createElement('div');
  el.className = 'changes-stash-entry';
  el.innerHTML = `<span class="changes-stash-msg">${escHtml(s.message)}</span><span class="changes-stash-date">${escHtml(s.date)}</span><button class="changes-stash-btn pop" data-index="${i}" title="Pop stash">Pop</button><button class="changes-stash-btn drop" data-index="${i}" title="Drop stash">Drop</button>`;
  return el;
}

// ── Git graph computation ─────────────────────────────────────
// Assigns each commit a lane (column) and computes connector lines
const GRAPH_COLORS = ['#4a9eff', '#3fb950', '#f0883e', '#bc8cff', '#f85149', '#56d4dd', '#e3b341', '#db61a2'];

function computeGraph(commits) {
  // lanes: array of hash strings occupying each column, null = empty
  const lanes = [];
  const rows = [];

  for (let i = 0; i < commits.length; i++) {
    const c = commits[i];
    const hash = c.hash;
    const parents = c.parents || [];

    // Find which lane this commit occupies (it was reserved by a child)
    let col = lanes.indexOf(hash);
    if (col === -1) {
      // First commit or branch head — find an empty lane or append
      col = lanes.indexOf(null);
      if (col === -1) { col = lanes.length; lanes.push(null); }
    }
    lanes[col] = null; // free the lane

    // Connections: lines from this row to the next
    const connectors = []; // { fromCol, toCol }

    // First parent continues straight down in same lane
    if (parents[0]) {
      const existingLane = lanes.indexOf(parents[0]);
      if (existingLane !== -1) {
        // Parent already has a lane (merge target) — draw line to it
        connectors.push({ fromCol: col, toCol: existingLane });
      } else {
        // Reserve this lane for first parent
        lanes[col] = parents[0];
        connectors.push({ fromCol: col, toCol: col });
      }
    }

    // Additional parents (merge sources) — find or create lanes
    for (let p = 1; p < parents.length; p++) {
      const parentHash = parents[p];
      let pLane = lanes.indexOf(parentHash);
      if (pLane === -1) {
        // Find empty lane or create new one
        pLane = lanes.indexOf(null);
        if (pLane === -1) { pLane = lanes.length; lanes.push(null); }
        lanes[pLane] = parentHash;
      }
      connectors.push({ fromCol: col, toCol: pLane });
    }

    // Pass-through lanes: lanes occupied by hashes not involved in this commit
    for (let l = 0; l < lanes.length; l++) {
      if (lanes[l] !== null && l !== col) {
        connectors.push({ fromCol: l, toCol: l });
      }
    }

    // Trim trailing nulls from lanes
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop();

    rows.push({
      col,
      color: GRAPH_COLORS[col % GRAPH_COLORS.length],
      connectors,
      totalLanes: Math.max(lanes.length, col + 1),
      isMerge: parents.length > 1,
    });
  }

  const maxLanes = rows.length ? Math.max(...rows.map(r => r.totalLanes)) : 1;
  return { rows, maxLanes };
}

// Render the full graph column as a single SVG overlaying the entries container.
// Each commit row is a fixed height; the SVG spans all rows.
const GRAPH_ROW_H = 28;
const GRAPH_COL_W = 10;

function renderFullGraphSvg(graph) {
  const { rows, maxLanes } = graph;
  const w = (maxLanes + 1) * GRAPH_COL_W;
  const h = rows.length * GRAPH_ROW_H;
  if (!w || !h) return '';
  const lines = [];
  const nodes = [];
  const sw = 1.5;
  const x = (col) => col * GRAPH_COL_W + GRAPH_COL_W / 2;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const cy = i * GRAPH_ROW_H + GRAPH_ROW_H / 2;

    for (const conn of row.connectors) {
      const x1 = x(conn.fromCol);
      const x2 = x(conn.toCol);
      // Next row's center, or just the bottom edge if last row
      const ny = (i + 1) < graph.rows.length
        ? (i + 1) * GRAPH_ROW_H + GRAPH_ROW_H / 2
        : h;

      if (conn.fromCol === row.col) {
        // Line from this commit's node down
        const color = GRAPH_COLORS[conn.toCol % GRAPH_COLORS.length];
        if (x1 === x2) {
          lines.push(`<line x1="${x1}" y1="${cy}" x2="${x2}" y2="${ny}" stroke="${color}" stroke-width="${sw}"/>`);
        } else {
          lines.push(`<path d="M${x1},${cy} C${x1},${cy + GRAPH_ROW_H * 0.7} ${x2},${ny - GRAPH_ROW_H * 0.7} ${x2},${ny}" stroke="${color}" stroke-width="${sw}" fill="none"/>`);
        }
      } else {
        // Pass-through: this lane has no node here, just continues straight
        const color = GRAPH_COLORS[conn.fromCol % GRAPH_COLORS.length];
        lines.push(`<line x1="${x1}" y1="${cy}" x2="${x2}" y2="${ny}" stroke="${color}" stroke-width="${sw}"/>`);
      }
    }

    // Node circle
    const r = row.isMerge ? 3.5 : 2.5;
    nodes.push(`<circle cx="${x(row.col)}" cy="${cy}" r="${r}" fill="${row.color}" stroke="#111" stroke-width="1"/>`);
  }

  // Lines behind nodes
  return `<svg class="git-graph-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${lines.join('')}${nodes.join('')}</svg>`;
}

function createCommitEl(c) {
  const el = document.createElement('div');
  el.className = 'changes-commit';
  el.dataset.hash = c.hash;
  el.innerHTML = `<div class="changes-commit-header"><span class="changes-commit-hash">${c.hash.slice(0, 7)}</span><span class="changes-commit-msg">${escHtml(c.message)}</span><button class="changes-commit-revert" data-revert-hash="${escHtml(c.hash)}" title="Revert this commit (creates a new undo commit)">Revert</button></div><div class="changes-commit-meta">${escHtml(c.author)} &middot; ${escHtml(c.date)}</div><div class="changes-commit-files"></div>`;
  return el;
}

// ── Main refresh (incremental) ──────────────────────────────────
export async function refreshChanges(workDir) {
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
    changesToolbar.style.display = 'none';
    changesCommitArea.style.display = 'none';
    changesCommitChangesBtn.disabled = true;
    changesReviewBtn.disabled = true;
    changesReviewLoopBtn.disabled = true;
    mainDivergenceEl.innerHTML = '';
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

  // Show toolbar/commit area (may have been hidden by non-git state)
  changesToolbar.style.display = '';
  changesCommitArea.style.display = '';

  // Update main divergence indicator
  updateMainDivergence(status.mainDivergence);

  // Update toolbar state
  const hasAnyChanges = status.staged.length > 0 || status.unstaged.length > 0 || status.untracked.length > 0;
  changesCommitChangesBtn.disabled = !hasAnyChanges;
  changesReviewBtn.disabled = !hasAnyChanges;
  changesReviewLoopBtn.disabled = !hasAnyChanges;

  // Build section descriptors (only include non-empty sections)
  const sections = [];

  // Post-commit prompt banner (if active for this workDir)
  if (gitState.postCommitPrompts.has(workDir) && _buildPostCommitSection) {
    const div = status.mainDivergence;
    // Show banner if: unpushed commits exist, or branch has no upstream yet
    const hasPushable = div && (div.pushAhead > 0 || !div.hasUpstream);
    if (hasPushable) {
      sections.push({ key: 'post-commit-prompt', items: [{ status, workDir }] });
    } else {
      // Nothing to push (or no remote at all) — auto-clear
      gitState.postCommitPrompts.delete(workDir);
    }
  }

  if (status.staged.length) sections.push({ key: 'staged', items: status.staged });
  if (status.unstaged.length) sections.push({ key: 'unstaged', items: status.unstaged });
  if (status.untracked.length) sections.push({ key: 'untracked', items: status.untracked });
  if (stashes.length) sections.push({ key: 'stashes', items: stashes });
  if (commits.length) sections.push({ key: 'commits', items: commits });
  if (!sections.length) sections.push({ key: 'empty', items: [] });

  // Reconcile sections
  reconcileChildren(changesBody, sections, 'section',
    sec => sec.key,
    sec => createSectionEl(sec),
    (el, sec) => updateSectionEl(el, sec),
  );

  // Restore scroll position
  changesBody.scrollTop = scrollTop;
}

// ── Commit Changes (spawns committer agent) ────────────────────
function _initCommitChangesListener() {
  changesCommitChangesBtn.addEventListener('click', () => {
    const activeWorkDir = tabState.activeWorkDir;
    if (!activeWorkDir) return;
    // Clear any stale post-commit banner before spawning new committer
    if (_dismissPostCommitPrompt) _dismissPostCommitPrompt(activeWorkDir);
    // Prevent duplicate committer agents on the same worktree
    for (const tab of tabState.tabs.values()) {
      if (tab.agentName === 'committer' && tab.workDir === activeWorkDir) {
        showChangesStatus('Committer already running', 'error');
        return;
      }
    }
    _startTask('committer', activeWorkDir, {
      initialPrompt: 'Commit all current changes in this working directory. Group them into logical batches with clear commit messages.',
    });
  });
}

// ── Fetch button ────────────────────────────────────────────────
function _initFetchListener() {
  document.getElementById('changes-fetch-btn').addEventListener('click', async () => {
    const activeWorkDir = tabState.activeWorkDir;
    if (!activeWorkDir) return;
    const btn = document.getElementById('changes-fetch-btn');
    btn.disabled = true;
    const result = await window.gitOps.fetch(activeWorkDir);
    btn.disabled = false;
    if (result.ok) { showChangesStatus('Fetched', 'success'); refreshChanges(activeWorkDir); refreshWorktreeMetrics(); }
    else showChangesStatus('Fetch failed: ' + (result.error || '').split('\n')[0], 'error');
  });
}

// ── Pull button ─────────────────────────────────────────────────
function _initPullListener() {
  document.getElementById('changes-pull-btn').addEventListener('click', async () => {
    const activeWorkDir = tabState.activeWorkDir;
    if (!activeWorkDir) return;
    const btn = document.getElementById('changes-pull-btn');
    btn.disabled = true;
    const result = await window.gitOps.pull(activeWorkDir);
    btn.disabled = false;
    if (result.ok) { showChangesStatus('Pulled', 'success'); refreshChanges(activeWorkDir); refreshWorktreeMetrics(); }
    else if (result.hasConflicts) { refreshChanges(activeWorkDir); refreshWorktreeMetrics(); showChangesStatus('Pull conflicts — resolve and commit', 'error'); }
    else showChangesStatus('Pull failed: ' + (result.error || '').split('\n')[0], 'error');
  });
}

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

// ── Push button ─────────────────────────────────────────────────
function _initPushListener() {
  document.getElementById('changes-push-btn').addEventListener('click', async () => {
    const activeWorkDir = tabState.activeWorkDir;
    if (!activeWorkDir) return;
    const btn = document.getElementById('changes-push-btn');
    btn.disabled = true;
    try { await doPush(activeWorkDir, { autoUpstream: false }); }
    finally { btn.disabled = false; }
  });
}

// ── Stash toolbar button ────────────────────────────────────────
function _initStashToolbarListener() {
  document.getElementById('changes-stash-btn').addEventListener('click', async () => {
    const activeWorkDir = tabState.activeWorkDir;
    if (!activeWorkDir) return;
    const result = await window.gitOps.stashSave(activeWorkDir, '');
    if (result.ok) { showChangesStatus('Stashed', 'success'); refreshChanges(activeWorkDir); refreshWorktreeMetrics(); }
    else showChangesStatus((result.error || 'Stash failed').split('\n')[0], 'error');
  });
}
