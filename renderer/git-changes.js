// ── Git Changes panel, diff viewer, branch modal, pull-latest-main ──
// Extracted from the monolithic renderer into an ES module.

import { tabState, gitState } from './state.js';
import { escHtml, statSpan, changeEntry, parseDiffOutput, renderDiffContent } from './utils.js';

// ── Cross-module deps (injected via initGitChanges) ────────────
let _refreshFileTree = null;
let _startTask = null;
let _loadProjects = null;
let _switchTab = null;
let _addTabToOrder = null;
let _renderTabBar = null;
let _tabsForWorkDir = null;

export function initGitChanges({ refreshFileTree, startTask, loadProjects, switchTab, addTabToOrder, renderTabBar, tabsForWorkDir }) {
  _refreshFileTree = refreshFileTree;
  _startTask = startTask;
  _loadProjects = loadProjects;
  _switchTab = switchTab;
  _addTabToOrder = addTabToOrder;
  _renderTabBar = renderTabBar;
  _tabsForWorkDir = tabsForWorkDir;

  // ── Wire up DOM event listeners that depend on injected deps ──
  _initCommitListeners();
  _initAmendListener();
  _initGenerateListener();
  _initFetchListener();
  _initPullListener();
  _initPushListener();
  _initPullMainListeners();
  _initStashToolbarListener();
  _initBranchModalListeners();
  _initChangesBodyDelegation();
}

// ── DOM refs (queried once per session) ─────────────────────────
const changesPanelWrapper = document.getElementById('changes-panel-wrapper');
const changesBody = document.getElementById('changes-body');
const changesCommitInput = document.getElementById('changes-commit-input');
const changesCommitBtn = document.getElementById('changes-commit-btn');
const changesGenerateBtn = document.getElementById('changes-generate-btn');

// ── Helper: refreshWorktreeMetrics (imported from sidebar) ──────
// Called after most git operations to update sidebar badges.
// We import it lazily in every call-site that needs it since sidebar
// isn't a constructor dependency.
async function refreshWorktreeMetrics() {
  // sidebar.js exports this; but to avoid a circular dep we call it
  // through the module that already wired us. We use dynamic import
  // only once and cache.
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
  // switchRightPanelTab is in the orchestrator; here we just pulse the tab
  const changesTab = document.querySelector('.filetree-tab[data-panel="changes"]');
  if (changesTab) {
    changesTab.classList.add('attention');
    clearTimeout(gitState._stageAttentionTimeout);
    gitState._stageAttentionTimeout = setTimeout(() => changesTab.classList.remove('attention'), 3000);
  }
  refreshChanges(path);
  return 'ok';
}

// ── Main refresh ────────────────────────────────────────────────
export async function refreshChanges(workDir) {
  changesBody.innerHTML = '<div class="changes-empty">Loading...</div>';
  const [status, commits, stashes] = await Promise.all([
    window.gitDiff.status(workDir),
    window.gitDiff.log(workDir, 20),
    window.gitDiff.stashList(workDir),
  ]);

  if (!status.isGit) {
    changesBody.innerHTML = '<div class="changes-empty">Not a git repository</div>';
    changesCommitBtn.disabled = true;
    changesGenerateBtn.disabled = true;
    return;
  }

  // Update commit button state
  changesCommitBtn.disabled = status.staged.length === 0 || !changesCommitInput.value.trim();
  changesGenerateBtn.disabled = status.staged.length === 0;
  document.getElementById('changes-amend-btn').disabled = commits.length === 0;

  let html = '';

  const unstageBtn = '<button class="changes-file-action changes-unstage" title="Unstage">&minus;</button>';
  const stageBtn = '<button class="changes-file-action changes-stage" title="Stage">+</button>';
  const discardBtn = '<button class="changes-file-action changes-discard" title="Discard changes">↺</button>';

  if (status.staged.length > 0) {
    html += `<div class="changes-section-header">Staged`
      + `<span class="changes-section-count">${status.staged.length}</span>`
      + `<button class="changes-section-action review-staged" title="Review staged changes">Review</button>`
      + `<button class="changes-section-action unstage-all" title="Unstage all">&minus; All</button>`
      + `</div>`;
    for (const f of status.staged)
      html += changeEntry(f.file, 'A', 'changes-badge-a', `data-file="${escHtml(f.file)}" data-staged="true"`, statSpan(f.added, f.deleted), unstageBtn);
  }

  if (status.unstaged.length > 0) {
    html += `<div class="changes-section-header">Changes`
      + `<span class="changes-section-count">${status.unstaged.length}</span>`
      + `<button class="changes-section-action stage-all-unstaged" title="Stage all changes">+ All</button>`
      + `<button class="changes-section-action discard-all-unstaged" title="Discard all changes">↺ All</button>`
      + `</div>`;
    for (const f of status.unstaged)
      html += changeEntry(f.file, 'M', 'changes-badge-m', `data-file="${escHtml(f.file)}" data-staged="false"`, statSpan(f.added, f.deleted), stageBtn, discardBtn);
  }

  if (status.untracked.length > 0) {
    html += `<div class="changes-section-header">Untracked`
      + `<span class="changes-section-count">${status.untracked.length}</span>`
      + `<button class="changes-section-action stage-all-untracked" title="Stage all untracked">+ All</button>`
      + `</div>`;
    for (const f of status.untracked)
      html += changeEntry(f, 'U', 'changes-badge-u', `data-file="${escHtml(f)}" data-untracked="true"`, '<span class="changes-added">new</span>', stageBtn);
  }

  if (stashes.length > 0) {
    html += `<div class="changes-section-header">Stashes`
      + `<span class="changes-section-count">${stashes.length}</span>`
      + `</div>`;
    for (let i = 0; i < stashes.length; i++) {
      const s = stashes[i];
      html += `<div class="changes-stash-entry">
        <span class="changes-stash-msg">${escHtml(s.message)}</span>
        <span class="changes-stash-date">${escHtml(s.date)}</span>
        <button class="changes-stash-btn pop" data-index="${i}" title="Pop stash">Pop</button>
        <button class="changes-stash-btn drop" data-index="${i}" title="Drop stash">Drop</button>
      </div>`;
    }
  }

  if (commits.length > 0) {
    html += '<div class="changes-section-header">Recent Commits</div>';
    for (const c of commits) {
      html += `<div class="changes-commit" data-hash="${c.hash}">
        <div class="changes-commit-header">
          <span class="changes-commit-hash">${c.hash.slice(0, 7)}</span>
          <span class="changes-commit-msg">${escHtml(c.message)}</span>
          <button class="changes-commit-revert" data-revert-hash="${escHtml(c.hash)}" title="Revert this commit (creates a new undo commit)">Revert</button>
        </div>
        <div class="changes-commit-meta">${escHtml(c.author)} &middot; ${escHtml(c.date)}</div>
        <div class="changes-commit-files"></div>
      </div>`;
    }
  }

  if (!html) html = '<div class="changes-empty">No changes</div>';
  changesBody.innerHTML = html;
}

// ── changesBody click delegation ────────────────────────────────
function _initChangesBodyDelegation() {
  changesBody.addEventListener('click', async (e) => {
    const activeWorkDir = tabState.activeWorkDir;

    // Stage button
    const stageBtnEl = e.target.closest('.changes-stage');
    if (stageBtnEl) {
      e.stopPropagation();
      const fileEl = stageBtnEl.closest('.changes-file');
      const file = fileEl.dataset.file;
      if (file && activeWorkDir) {
        const result = await window.gitOps.stage(activeWorkDir, [file]);
        if (result.ok) { showChangesStatus('Staged', 'success'); refreshChanges(activeWorkDir); refreshWorktreeMetrics(); }
        else showChangesStatus('Stage failed', 'error');
      }
      return;
    }

    // Unstage button
    const unstageBtnEl = e.target.closest('.changes-unstage');
    if (unstageBtnEl) {
      e.stopPropagation();
      const fileEl = unstageBtnEl.closest('.changes-file');
      const file = fileEl.dataset.file;
      if (file && activeWorkDir) {
        const result = await window.gitOps.unstage(activeWorkDir, [file]);
        if (result.ok) { showChangesStatus('Unstaged', 'success'); refreshChanges(activeWorkDir); refreshWorktreeMetrics(); }
        else showChangesStatus('Unstage failed', 'error');
      }
      return;
    }

    // Stash pop
    const stashPopBtn = e.target.closest('.changes-stash-btn.pop');
    if (stashPopBtn) {
      const idx = parseInt(stashPopBtn.dataset.index);
      if (activeWorkDir) {
        const result = await window.gitOps.stashPop(activeWorkDir, idx);
        if (result.ok) { showChangesStatus('Stash popped', 'success'); refreshChanges(activeWorkDir); refreshWorktreeMetrics(); }
        else {
          if (result.hasConflicts) { refreshChanges(activeWorkDir); refreshWorktreeMetrics(); }
          showChangesStatus(result.hasConflicts ? 'Conflicts on stash pop — resolve manually' : (result.error || '').split('\n')[0], 'error');
        }
      }
      return;
    }

    // Stash drop
    const stashDropBtn = e.target.closest('.changes-stash-btn.drop');
    if (stashDropBtn) {
      const idx = parseInt(stashDropBtn.dataset.index);
      if (activeWorkDir) {
        const result = await window.gitOps.stashDrop(activeWorkDir, idx);
        if (result.ok) { showChangesStatus('Stash dropped', 'success'); refreshChanges(activeWorkDir); refreshWorktreeMetrics(); }
        else showChangesStatus((result.error || '').split('\n')[0], 'error');
      }
      return;
    }

    // Review staged files
    if (e.target.closest('.review-staged')) {
      if (activeWorkDir) {
        _startTask('code-reviewer', activeWorkDir, {
          initialPrompt: 'Review the currently staged changes (git diff --cached). Provide feedback on code quality, potential bugs, and suggestions for improvement.'
        });
      } else {
        showChangesStatus('No active directory', 'error');
      }
      return;
    }

    // Unstage all
    if (e.target.closest('.unstage-all')) {
      if (activeWorkDir) {
        const files = [...changesBody.querySelectorAll('[data-staged="true"]')].map(el => el.dataset.file);
        if (files.length) {
          const result = await window.gitOps.unstage(activeWorkDir, files);
          if (result.ok) { showChangesStatus('Unstaged all', 'success'); refreshChanges(activeWorkDir); refreshWorktreeMetrics(); }
          else showChangesStatus('Unstage failed', 'error');
        }
      }
      return;
    }

    // Discard single file
    const discardBtnEl = e.target.closest('.changes-discard');
    if (discardBtnEl) {
      e.stopPropagation();
      const fileEl = discardBtnEl.closest('.changes-file');
      const file = fileEl?.dataset.file;
      if (file && activeWorkDir && confirm(`Discard changes to ${file}? This cannot be undone.`)) {
        const result = await window.gitOps.discard(activeWorkDir, [file]);
        if (result.ok) { showChangesStatus('Changes discarded', 'success'); refreshChanges(activeWorkDir); refreshWorktreeMetrics(); }
        else showChangesStatus('Discard failed: ' + (result.error || '').split('\n')[0], 'error');
      }
      return;
    }

    // Discard all unstaged changes
    if (e.target.closest('.discard-all-unstaged')) {
      e.stopPropagation();
      if (activeWorkDir) {
        const files = [...changesBody.querySelectorAll('[data-staged="false"]')].map(el => el.dataset.file);
        if (files.length && confirm(`Discard all ${files.length} changes? This cannot be undone.`)) {
          const result = await window.gitOps.discard(activeWorkDir, files);
          if (result.ok) { showChangesStatus('All changes discarded', 'success'); refreshChanges(activeWorkDir); refreshWorktreeMetrics(); }
          else showChangesStatus('Discard failed: ' + (result.error || '').split('\n')[0], 'error');
        }
      }
      return;
    }

    // Revert commit
    const revertBtn = e.target.closest('.changes-commit-revert');
    if (revertBtn) {
      e.stopPropagation();
      const hash = revertBtn.dataset.revertHash;
      if (hash && activeWorkDir && confirm(`Revert commit ${hash.slice(0, 7)}? This will create a new commit that undoes those changes.`)) {
        revertBtn.textContent = 'Reverting…';
        revertBtn.disabled = true;
        const result = await window.gitOps.revertCommit(activeWorkDir, hash);
        if (result.ok) {
          showChangesStatus('Commit reverted', 'success');
          refreshChanges(activeWorkDir);
          refreshWorktreeMetrics();
        } else {
          if (result.hasConflicts) {
            revertBtn.textContent = 'Revert';
            revertBtn.disabled = false;
            refreshChanges(activeWorkDir);
            refreshWorktreeMetrics();
            showChangesStatus('Revert conflicts — resolve manually then commit', 'error');
          } else {
            revertBtn.textContent = 'Revert';
            revertBtn.disabled = false;
            showChangesStatus('Revert failed: ' + (result.error || '').split('\n')[0], 'error');
          }
        }
      }
      return;
    }

    // Stage all unstaged changes
    if (e.target.closest('.stage-all-unstaged')) {
      if (activeWorkDir) {
        const files = [...changesBody.querySelectorAll('[data-staged="false"]')].map(el => el.dataset.file);
        if (files.length) {
          const result = await window.gitOps.stage(activeWorkDir, files);
          if (result.ok) { showChangesStatus('Staged all', 'success'); refreshChanges(activeWorkDir); refreshWorktreeMetrics(); }
          else showChangesStatus('Stage failed', 'error');
        }
      }
      return;
    }

    // Stage all untracked
    if (e.target.closest('.stage-all-untracked')) {
      if (activeWorkDir) {
        const files = [...changesBody.querySelectorAll('[data-untracked="true"]')].map(el => el.dataset.file);
        if (files.length) {
          const result = await window.gitOps.stage(activeWorkDir, files);
          if (result.ok) { showChangesStatus('Staged all', 'success'); refreshChanges(activeWorkDir); refreshWorktreeMetrics(); }
          else showChangesStatus('Stage failed', 'error');
        }
      }
      return;
    }

    // File click — open diff or editor
    const fileEl = e.target.closest('.changes-file');
    if (fileEl) {
      const file = fileEl.dataset.file;
      const commitHash = fileEl.dataset.commit;
      const untracked = fileEl.dataset.untracked === 'true';
      const staged = fileEl.dataset.staged === 'true';
      if (untracked) {
        const { openFileEditor } = await import('./terminals.js');
        openFileEditor(file, file.split('/').pop());
      } else if (commitHash) {
        openDiffTab(activeWorkDir, file, false, commitHash);
      } else {
        openDiffTab(activeWorkDir, file, staged, null);
      }
      return;
    }

    // Commit expand — toggle file list
    const commitEl = e.target.closest('.changes-commit');
    if (commitEl) {
      const hash = commitEl.dataset.hash;
      const filesEl = commitEl.querySelector('.changes-commit-files');
      const isExpanded = commitEl.classList.toggle('expanded');
      if (isExpanded && filesEl.children.length === 0) {
        const files = await window.gitDiff.commitFiles(activeWorkDir, hash);
        let fhtml = '';
        for (const f of files)
          fhtml += changeEntry(f.file, 'M', 'changes-badge-m', `data-file="${escHtml(f.file)}" data-commit="${hash}"`, statSpan(f.added, f.deleted));
        filesEl.innerHTML = fhtml || '<div class="changes-empty">No files</div>';
      }
    }
  });
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

// ── Pull Latest Main — modals & flow ────────────────────────────

function showPullMainDirtyModal(workDir, dirtyCount) {
  gitState.currentPullMainWorkDir = workDir;
  document.getElementById('pull-main-dirty-msg').textContent =
    `You have ${dirtyCount} uncommitted change${dirtyCount !== 1 ? 's' : ''}. Stash them automatically before merging, or commit them first.`;
  document.getElementById('pull-main-dirty-modal').classList.add('active');
  return new Promise(resolve => { gitState._pullMainDirtyResolve = resolve; });
}

function closePullMainDirtyModal() {
  document.getElementById('pull-main-dirty-modal').classList.remove('active');
  gitState._pullMainDirtyResolve = null;
}

function showPullMainConflictsModal(workDir, conflictedFiles, isStashConflict) {
  gitState.currentPullMainWorkDir = workDir;
  gitState._pullMainIsStashConflict = isStashConflict;
  const title = document.getElementById('pull-main-conflicts-title');
  const msg = document.getElementById('pull-main-conflicts-msg');
  const abortBtn = document.getElementById('pull-main-abort-btn');
  if (isStashConflict) {
    title.textContent = 'Stash Restore Conflicts';
    msg.textContent = `Your stash was restored after a successful merge, but caused conflicts in ${conflictedFiles.length} file(s):`;
    abortBtn.textContent = 'Discard Stashed Changes';
  } else {
    title.textContent = 'Merge Conflicts';
    msg.innerHTML = `Merging <code>origin/main</code> caused conflicts in ${conflictedFiles.length} file(s):`;
    abortBtn.textContent = 'Abort Merge';
  }
  const ul = document.getElementById('pull-main-conflict-files');
  ul.innerHTML = conflictedFiles.map(f => `<li>${escHtml(f)}</li>`).join('');
  document.getElementById('pull-main-stash-note').style.display = 'none';
  document.getElementById('pull-main-conflicts-modal').classList.add('active');
}

function closePullMainConflictsModal() {
  document.getElementById('pull-main-conflicts-modal').classList.remove('active');
}

export async function doPullLatestMain(workDir) {
  let result = await window.gitOps.pullLatestMain(workDir, { autoStash: false });

  if (result.isDirty) {
    const choice = await showPullMainDirtyModal(workDir, result.dirtyCount);
    closePullMainDirtyModal();
    if (choice === 'cancel') return;
    if (choice === 'commit') {
      const stageOutcome = await stageAndPromptCommit(workDir, result.dirtyCount);
      if (stageOutcome === 'ok') showChangesStatus('Staged — commit and pull again', 'info');
      else if (stageOutcome === 'cancelled') showChangesStatus('Cancelled', 'info');
      else if (stageOutcome === 'error') showChangesStatus('Stage failed', 'error');
      return;
    }
    // choice === 'stash'
    showChangesStatus('Stashing & merging...', 'info');
    result = await window.gitOps.pullLatestMain(workDir, { autoStash: true });
  }

  if (result.hasConflicts) {
    showPullMainConflictsModal(workDir, result.conflictedFiles || [], false);
    refreshChanges(workDir);
    refreshWorktreeMetrics();
    return;
  }

  if (result.stashPopConflicts) {
    showPullMainConflictsModal(workDir, result.conflictedFiles || [], true);
    refreshChanges(workDir);
    refreshWorktreeMetrics();
    return;
  }

  if (!result.ok) {
    showChangesStatus((result.error || 'Pull main failed').split('\n')[0], 'error');
    return;
  }

  if (result.alreadyUpToDate) {
    showChangesStatus('Already up to date with main', 'success');
  } else if (result.stashPopped) {
    showChangesStatus('Merged & restored your changes', 'success');
  } else {
    showChangesStatus('Merged latest main', 'success');
  }
  refreshChanges(workDir);
  refreshWorktreeMetrics();
}

function _initPullMainListeners() {
  document.getElementById('pull-main-stash-btn').addEventListener('click', () => {
    if (gitState._pullMainDirtyResolve) gitState._pullMainDirtyResolve('stash');
  });
  document.getElementById('pull-main-commit-btn').addEventListener('click', () => {
    if (gitState._pullMainDirtyResolve) gitState._pullMainDirtyResolve('commit');
  });
  document.getElementById('pull-main-dirty-cancel').addEventListener('click', () => {
    if (gitState._pullMainDirtyResolve) gitState._pullMainDirtyResolve('cancel');
  });

  document.getElementById('pull-main-open-merger-btn').addEventListener('click', () => {
    const workDir = gitState.currentPullMainWorkDir;
    const isStash = gitState._pullMainIsStashConflict;
    const initialPrompt = isStash
      ? `Your stashed changes (WIP: before pulling main) were being restored after a successful merge of \`origin/main\`, but caused conflicts.\n\nWorking directory: ${workDir}\n\nThe stash restore is already in progress. Resolve each conflicted file by opening it, fixing the conflict markers, then staging it:\n  git -C '${workDir}' add <file>\n\nOnce all conflicts are resolved, drop the stash:\n  git -C '${workDir}' stash drop stash@{0}\n\nUse AskUserQuestion whenever you are unsure which side to keep.`
      : `The merge of \`origin/main\` into your branch is in progress and has conflicts.\n\nWorking directory: ${workDir}\n\nThe merge is already started — do NOT run git merge again. Resolve each conflicted file by opening it, fixing the conflict markers, then staging it:\n  git -C '${workDir}' add <file>\n\nOnce all conflicts are resolved, commit the merge:\n  git -C '${workDir}' commit\n\nUse AskUserQuestion whenever you are unsure which side to keep.`;
    closePullMainConflictsModal();
    _startTask('merger', workDir, { initialPrompt });
  });

  document.getElementById('pull-main-abort-btn').addEventListener('click', async () => {
    const workDir = gitState.currentPullMainWorkDir;
    const isStash = gitState._pullMainIsStashConflict;
    closePullMainConflictsModal();
    if (isStash) {
      await window.gitOps.restoreWorkingTree(workDir);
      await window.gitOps.stashDrop(workDir, 0);
      showChangesStatus('Stash discarded', 'info');
    } else {
      await window.gitOps.abortMerge(workDir);
      showChangesStatus('Merge aborted', 'info');
    }
    refreshChanges(workDir);
    refreshWorktreeMetrics();
  });

  // Pull Latest Main toolbar button
  document.getElementById('changes-pull-main-btn').addEventListener('click', async () => {
    const activeWorkDir = tabState.activeWorkDir;
    if (!activeWorkDir) return;
    const btn = document.getElementById('changes-pull-main-btn');
    btn.disabled = true;
    await doPullLatestMain(activeWorkDir);
    btn.disabled = false;
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

// ── Branch modal ────────────────────────────────────────────────
const branchModal = document.getElementById('branch-modal');
const branchList = document.getElementById('branch-list');
const branchError = document.getElementById('branch-error');
const branchCreateInput = document.getElementById('branch-create-input');

export async function openBranchModal() {
  branchError.classList.remove('visible');
  branchCreateInput.value = '';
  branchList.innerHTML = '<div class="changes-empty">Loading...</div>';
  branchModal.classList.add('active');
  await refreshBranchList();
}

async function refreshBranchList() {
  const activeWorkDir = tabState.activeWorkDir;
  const branches = await window.gitDiff.branchList(activeWorkDir);
  let html = '';
  for (const b of branches) {
    const currentCls = b.isCurrent ? ' current' : '';
    const wtCls = b.inWorktree ? ' in-worktree' : '';
    const badges = [];
    if (b.isCurrent) badges.push('<span class="branch-badge">current</span>');
    if (b.inWorktree) badges.push('<span class="branch-badge wt">worktree</span>');
    if (b.tracking) badges.push(`<span class="branch-badge">${escHtml(b.tracking)}</span>`);
    let syncHtml = '';
    if (b.ahead || b.behind) {
      const parts = [];
      if (b.ahead) parts.push('+' + b.ahead);
      if (b.behind) parts.push('-' + b.behind);
      syncHtml = `<span class="branch-sync">${parts.join(' ')}</span>`;
    }
    const actions = [];
    if (!b.isCurrent && !b.inWorktree) {
      actions.push(`<button class="branch-action-btn switch" data-branch="${escHtml(b.name)}">Switch</button>`);
      actions.push(`<button class="branch-action-btn delete" data-branch="${escHtml(b.name)}">Delete</button>`);
    }
    html += `<div class="branch-item${currentCls}${wtCls}">
      <span class="branch-name">${escHtml(b.name)}</span>
      ${badges.join('')}${syncHtml}
      <div class="branch-actions">${actions.join('')}</div>
    </div>`;
  }
  branchList.innerHTML = html || '<div class="changes-empty">No branches</div>';
}

function _initBranchModalListeners() {
  document.getElementById('changes-branch-btn').addEventListener('click', () => {
    const activeWorkDir = tabState.activeWorkDir;
    if (!activeWorkDir) return;
    openBranchModal();
  });

  document.getElementById('branch-close-btn').addEventListener('click', () => {
    branchModal.classList.remove('active');
  });

  branchModal.addEventListener('click', (e) => {
    if (e.target === branchModal) branchModal.classList.remove('active');
  });

  // Branch create
  document.getElementById('branch-create-btn').addEventListener('click', async () => {
    const activeWorkDir = tabState.activeWorkDir;
    const name = branchCreateInput.value.trim();
    if (!name || !activeWorkDir) return;
    branchError.classList.remove('visible');
    const result = await window.gitOps.branchCreate(activeWorkDir, name);
    if (result.ok) {
      branchCreateInput.value = '';
      await refreshBranchList();
      refreshChanges(activeWorkDir);
      refreshWorktreeMetrics();
      showChangesStatus(`Created branch ${name}`, 'success');
    } else {
      branchError.textContent = (result.error || '').split('\n')[0];
      branchError.classList.add('visible');
    }
  });

  // Branch switch / delete (delegated)
  branchList.addEventListener('click', async (e) => {
    const activeWorkDir = tabState.activeWorkDir;

    const switchBtn = e.target.closest('.branch-action-btn.switch');
    if (switchBtn) {
      const name = switchBtn.dataset.branch;
      branchError.classList.remove('visible');
      const result = await window.gitOps.branchSwitch(activeWorkDir, name);
      if (result.ok) {
        await refreshBranchList();
        refreshChanges(activeWorkDir);
        refreshWorktreeMetrics();
        _loadProjects();
        showChangesStatus(`Switched to ${name}`, 'success');
      } else {
        branchError.textContent = (result.error || '').split('\n')[0];
        branchError.classList.add('visible');
      }
      return;
    }

    const deleteBtn = e.target.closest('.branch-action-btn.delete');
    if (deleteBtn) {
      const name = deleteBtn.dataset.branch;
      branchError.classList.remove('visible');
      const result = await window.gitOps.branchDelete(activeWorkDir, name, false);
      if (result.ok) {
        await refreshBranchList();
        refreshWorktreeMetrics();
        showChangesStatus(`Deleted branch ${name}`, 'success');
      } else if (result.notMerged) {
        if (confirm(`Branch '${name}' is not fully merged. Force delete?`)) {
          const forceResult = await window.gitOps.branchDelete(activeWorkDir, name, true);
          if (forceResult.ok) {
            await refreshBranchList();
            refreshWorktreeMetrics();
            showChangesStatus(`Deleted branch ${name}`, 'success');
          } else {
            branchError.textContent = (forceResult.error || '').split('\n')[0];
            branchError.classList.add('visible');
          }
        }
      } else {
        branchError.textContent = (result.error || '').split('\n')[0];
        branchError.classList.add('visible');
      }
      return;
    }
  });
}

// ── Diff viewer tab ─────────────────────────────────────────────
export async function openDiffTab(workDir, filePath, staged, commitHash) {
  const diffKey = commitHash ? `${commitHash}:${filePath}` : `${staged ? 'staged' : 'unstaged'}:${filePath}`;
  for (const [id, tab] of tabState.tabs) {
    if (tab.type === 'diff' && tab.diffKey === diffKey && tab.workDir === workDir) {
      _switchTab(id);
      return;
    }
  }

  const mainPanel = document.getElementById('main-panel');
  const settingsPanel = document.getElementById('settings-view');
  const launchpad = document.getElementById('launchpad');
  const terminalView = document.getElementById('terminal-view');
  const terminalContainers = document.getElementById('terminal-containers');

  mainPanel.style.display = 'none';
  settingsPanel.classList.remove('active');
  launchpad.classList.remove('active');
  terminalView.classList.add('active');

  const diffText = commitHash
    ? await window.gitDiff.diffCommit(workDir, commitHash, filePath)
    : await window.gitDiff.diff(workDir, filePath, staged);

  const parsed = parseDiffOutput(diffText);
  const id = tabState.nextBrowserTabId--;

  const pane = document.createElement('div');
  pane.className = 'terminal-pane diff-pane';
  terminalContainers.appendChild(pane);

  const suffix = commitHash ? commitHash.slice(0, 7) : (staged ? 'staged' : 'working');
  const toolbar = document.createElement('div');
  toolbar.className = 'diff-toolbar';
  toolbar.innerHTML = `
    <span class="diff-filepath">${escHtml(filePath)} <span style="color:#555">(${suffix})</span></span>
    <div class="toolbar-spacer"></div>
    <span class="diff-stats"><span class="changes-added">+${parsed.totalAdded}</span>&ensp;<span class="changes-deleted">&minus;${parsed.totalDeleted}</span></span>
  `;
  pane.appendChild(toolbar);

  const content = document.createElement('div');
  content.className = 'diff-content';
  if (parsed.hunks.length > 0) {
    content.innerHTML = renderDiffContent(parsed);
  } else {
    content.innerHTML = '<div class="changes-empty" style="padding:20px">No diff available</div>';
  }
  pane.appendChild(content);

  const tabLabel = filePath.split('/').pop();
  tabState.tabs.set(id, { type: 'diff', pane, tabEl: null, label: tabLabel, workDir, filePath, diffKey });
  _addTabToOrder(id, workDir);
  tabState.activeTabId = id;
  _renderTabBar();
  _switchTab(id);
}
