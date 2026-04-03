// ── Git Changes panel — status, staging, commit toolbar ─────────
import { tabState, gitState } from './state.js';
import { escHtml, statSpan, createChangeEntryEl } from './utils.js';
import { reconcileChildren, patchText, patchHtml } from './dom-patch.js';
import { initChangesModals, doPullLatestMain, openBranchModal, openDiffTab } from './git-changes-modals.js';
import { initChangesActions } from './git-changes-actions.js';
import { initTreeToggle, renderTreeEntries } from './git-changes-tree.js';

// ── Cross-module deps (injected via initGitChanges) ────────────
let _refreshFileTree = null;
let _startTask = null;

export function initGitChanges({ refreshFileTree, startTask, loadProjects, switchTab, addTabToOrder, renderTabBar, tabsForWorkDir }) {
  _refreshFileTree = refreshFileTree;
  _startTask = startTask;

  // Forward deps to modals sub-module
  initChangesModals({
    refreshChanges, showChangesStatus, stageAndPromptCommit, refreshWorktreeMetrics,
    startTask, loadProjects, switchTab, addTabToOrder, renderTabBar,
  });

  _initCommitListeners();
  _initAmendListener();
  _initGenerateListener();
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

// ── DOM refs (queried once per session) ─────────────────────────
// Initialize tree view preference from localStorage
gitState.changesTreeView = localStorage.getItem('braska-changes-tree-view') === 'true';

const changesBody = document.getElementById('changes-body');
const changesCommitInput = document.getElementById('changes-commit-input');
const changesCommitBtn = document.getElementById('changes-commit-btn');
const changesGenerateBtn = document.getElementById('changes-generate-btn');

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
    actions: '<button class="changes-section-action review-staged" title="Review staged changes">Review</button><span class="changes-header-actions"><button class="changes-section-action-icon unstage-all" title="Unstage all">&minus;</button><span class="changes-action-placeholder"></span></span>',
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
    el.innerHTML = '<div class="changes-section-header">Recent Commits</div>';
    const entries = document.createElement('div');
    entries.className = 'changes-section-entries';
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
    const entries = el.querySelector('.changes-section-entries');
    reconcileChildren(entries, sec.items, 'hash',
      c => c.hash,
      c => createCommitEl(c),
      (existing, c) => {
        patchText(existing, '.changes-commit-msg', c.message);
        patchText(existing, '.changes-commit-meta', `${c.author} · ${c.date}`);
      },
    );
  }
}

function createStashEl(s, i) {
  const el = document.createElement('div');
  el.className = 'changes-stash-entry';
  el.innerHTML = `<span class="changes-stash-msg">${escHtml(s.message)}</span><span class="changes-stash-date">${escHtml(s.date)}</span><button class="changes-stash-btn pop" data-index="${i}" title="Pop stash">Pop</button><button class="changes-stash-btn drop" data-index="${i}" title="Drop stash">Drop</button>`;
  return el;
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

  // Preserve expanded commit state
  const expandedHashes = new Set(
    [...changesBody.querySelectorAll('.changes-commit.expanded')].map(el => el.dataset.hash)
  );

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
    changesBody.innerHTML = '<div class="changes-empty">Not a git repository</div>';
    changesCommitBtn.disabled = true;
    changesGenerateBtn.disabled = true;
    return;
  }

  // Update toolbar state
  changesCommitBtn.disabled = status.staged.length === 0 || !changesCommitInput.value.trim();
  changesGenerateBtn.disabled = status.staged.length === 0;
  document.getElementById('changes-amend-btn').disabled = commits.length === 0;

  // Build section descriptors (only include non-empty sections)
  const sections = [];
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

  // Restore expanded commits
  for (const hash of expandedHashes) {
    const commitEl = changesBody.querySelector(`.changes-commit[data-hash="${hash}"]`);
    if (commitEl) commitEl.classList.add('expanded');
  }

  // Restore scroll position
  changesBody.scrollTop = scrollTop;
}

// ── Commit message input ────────────────────────────────────────
function _initCommitListeners() {
  changesCommitInput.addEventListener('input', () => {
    const hasStaged = changesBody.querySelector('[data-staged="true"]');
    changesCommitBtn.disabled = !changesCommitInput.value.trim() || !hasStaged;
  });

  changesCommitBtn.addEventListener('click', async () => {
    const activeWorkDir = tabState.activeWorkDir;
    const msg = changesCommitInput.value.trim();
    if (!msg || !activeWorkDir) return;
    changesCommitBtn.disabled = true;
    changesCommitBtn.textContent = 'Committing...';
    const result = await window.gitOps.commit(activeWorkDir, msg);
    if (result.ok) {
      changesCommitBtn.textContent = 'Commit';
      changesCommitInput.value = '';
      changesCommitBtn.disabled = true;
      showChangesStatus('Committed', 'success');
      refreshChanges(activeWorkDir);
      refreshWorktreeMetrics();
    } else {
      changesCommitBtn.textContent = 'Commit';
      changesCommitBtn.disabled = false;
      showChangesStatus((result.error || 'Commit failed').split('\n')[0], 'error');
    }
  });
}

// ── Amend last commit ───────────────────────────────────────────
function _initAmendListener() {
  const changesAmendBtn = document.getElementById('changes-amend-btn');
  changesAmendBtn.addEventListener('click', async () => {
    const activeWorkDir = tabState.activeWorkDir;
    if (!activeWorkDir) return;
    const msg = changesCommitInput.value.trim();
    const hasStaged = !!changesBody.querySelector('[data-staged="true"]');
    if (!msg && !hasStaged) {
      showChangesStatus('Nothing to amend: stage files or enter a new message', 'error');
      return;
    }
    changesAmendBtn.disabled = true;
    changesAmendBtn.textContent = 'Amending…';
    const result = await window.gitOps.amend(activeWorkDir, msg || null);
    if (result.ok) {
      changesAmendBtn.textContent = 'Amend';
      changesAmendBtn.disabled = false;
      if (msg) changesCommitInput.value = '';
      showChangesStatus('Last commit amended', 'success');
      refreshChanges(activeWorkDir);
      refreshWorktreeMetrics();
    } else {
      changesAmendBtn.textContent = 'Amend';
      changesAmendBtn.disabled = false;
      showChangesStatus((result.error || 'Amend failed').split('\n')[0], 'error');
    }
  });
}

// ── Auto-generate commit message ────────────────────────────────
function _initGenerateListener() {
  changesGenerateBtn.addEventListener('click', async () => {
    const activeWorkDir = tabState.activeWorkDir;
    if (!activeWorkDir) return;
    changesGenerateBtn.disabled = true;
    changesGenerateBtn.classList.add('generating');
    const result = await window.gitOps.generateCommitMsg(activeWorkDir);
    changesGenerateBtn.classList.remove('generating');
    changesGenerateBtn.disabled = false;
    if (result.ok) {
      changesCommitInput.value = result.message;
      changesCommitInput.style.height = 'auto';
      changesCommitInput.style.height = changesCommitInput.scrollHeight + 'px';
      changesCommitInput.dispatchEvent(new Event('input'));
      showChangesStatus('Message generated', 'success');
    } else {
      showChangesStatus((result.error || 'Generation failed').split('\n')[0], 'error');
    }
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

// ── Push button ─────────────────────────────────────────────────
function _initPushListener() {
  document.getElementById('changes-push-btn').addEventListener('click', async () => {
    const activeWorkDir = tabState.activeWorkDir;
    if (!activeWorkDir) return;
    const btn = document.getElementById('changes-push-btn');
    btn.disabled = true;
    const result = await window.gitOps.push(activeWorkDir);
    if (result.ok) {
      btn.disabled = false;
      showChangesStatus('Pushed', 'success');
      refreshChanges(activeWorkDir);
      refreshWorktreeMetrics();
      return;
    }
    if (result.noUpstream) {
      const branch = await window.gitDiff.currentBranch(activeWorkDir);
      if (branch && confirm(`No upstream branch. Push and set upstream to origin/${branch}?`)) {
        const upResult = await window.gitOps.pushSetUpstream(activeWorkDir, branch);
        btn.disabled = false;
        if (upResult.ok) { showChangesStatus('Pushed (upstream set)', 'success'); refreshChanges(activeWorkDir); refreshWorktreeMetrics(); }
        else showChangesStatus('Push failed: ' + (upResult.error || '').split('\n')[0], 'error');
      } else {
        btn.disabled = false;
        showChangesStatus('Push cancelled', 'info');
      }
      return;
    }
    btn.disabled = false;
    showChangesStatus('Push failed: ' + (result.error || '').split('\n')[0], 'error');
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
