// ── Git changes modals — pull-latest-main flow, branch modal, diff viewer ──

import { tabState, gitState } from './state.js';
import { escHtml, statSpan, parseDiffOutput, renderDiffContent } from './utils.js';

// ── Cross-module deps (injected via initChangesModals) ─────────
let _refreshChanges = null;
let _showChangesStatus = null;
let _stageAndPromptCommit = null;
let _refreshWorktreeMetrics = null;
let _startTask = null;
let _loadProjects = null;
let _switchTab = null;
let _addTabToOrder = null;
let _renderTabBar = null;

export function initChangesModals(deps) {
  _refreshChanges = deps.refreshChanges;
  _showChangesStatus = deps.showChangesStatus;
  _stageAndPromptCommit = deps.stageAndPromptCommit;
  _refreshWorktreeMetrics = deps.refreshWorktreeMetrics;
  _startTask = deps.startTask;
  _loadProjects = deps.loadProjects;
  _switchTab = deps.switchTab;
  _addTabToOrder = deps.addTabToOrder;
  _renderTabBar = deps.renderTabBar;
  _initPullMainListeners();
  _initBranchModalListeners();
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
  _showChangesStatus('Pulling latest main...', 'info');
  let result = await window.gitOps.pullLatestMain(workDir, { autoStash: false });

  if (result.isDirty) {
    const choice = await showPullMainDirtyModal(workDir, result.dirtyCount);
    closePullMainDirtyModal();
    if (choice === 'cancel') return;
    if (choice === 'commit') {
      const stageOutcome = await _stageAndPromptCommit(workDir, result.dirtyCount);
      if (stageOutcome === 'ok') _showChangesStatus('Staged — commit and pull again', 'info');
      else if (stageOutcome === 'cancelled') _showChangesStatus('Cancelled', 'info');
      else if (stageOutcome === 'error') _showChangesStatus('Stage failed', 'error');
      return;
    }
    // choice === 'stash'
    _showChangesStatus('Stashing & merging...', 'info');
    result = await window.gitOps.pullLatestMain(workDir, { autoStash: true });
  }

  if (result.hasConflicts) {
    showPullMainConflictsModal(workDir, result.conflictedFiles || [], false);
    _refreshChanges(workDir);
    _refreshWorktreeMetrics();
    return;
  }

  if (result.stashPopConflicts) {
    showPullMainConflictsModal(workDir, result.conflictedFiles || [], true);
    _refreshChanges(workDir);
    _refreshWorktreeMetrics();
    return;
  }

  if (!result.ok) {
    _showChangesStatus((result.error || 'Pull main failed').split('\n')[0], 'error');
    return;
  }

  if (result.alreadyUpToDate) {
    _showChangesStatus('Already up to date with main', 'success');
  } else if (result.stashPopped) {
    _showChangesStatus('Merged & restored your changes', 'success');
  } else {
    _showChangesStatus('Merged latest main', 'success');
  }
  _refreshChanges(workDir);
  _refreshWorktreeMetrics();
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
      _showChangesStatus('Stash discarded', 'info');
    } else {
      await window.gitOps.abortMerge(workDir);
      _showChangesStatus('Merge aborted', 'info');
    }
    _refreshChanges(workDir);
    _refreshWorktreeMetrics();
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

  branchCreateInput.addEventListener('input', () => {
    const { selectionStart } = branchCreateInput;
    branchCreateInput.value = branchCreateInput.value.replace(/ /g, '-');
    branchCreateInput.setSelectionRange(selectionStart, selectionStart);
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
      _refreshChanges(activeWorkDir);
      _refreshWorktreeMetrics();
      _showChangesStatus(`Created branch ${name}`, 'success');
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
        _refreshChanges(activeWorkDir);
        _refreshWorktreeMetrics();
        _loadProjects();
        _showChangesStatus(`Switched to ${name}`, 'success');
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
        _refreshWorktreeMetrics();
        _showChangesStatus(`Deleted branch ${name}`, 'success');
      } else if (result.notMerged) {
        if (confirm(`Branch '${name}' is not fully merged. Force delete?`)) {
          const forceResult = await window.gitOps.branchDelete(activeWorkDir, name, true);
          if (forceResult.ok) {
            await refreshBranchList();
            _refreshWorktreeMetrics();
            _showChangesStatus(`Deleted branch ${name}`, 'success');
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

  const mainIntro = document.getElementById('main');
  const settingsPanel = document.getElementById('settings-panel');
  const launchpad = document.getElementById('launchpad');
  const terminalView = document.getElementById('terminal-view');
  const terminalContainers = document.getElementById('terminal-containers');

  mainIntro.style.display = 'none';
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
