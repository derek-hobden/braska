// Worktree modals — context menu, create, delete, merge & cleanup

import { modalState } from './state.js';

// ── DOM refs (queried once at module level) ──
const wtContextMenu = document.getElementById('wt-context-menu');
const wtCreateModal = document.getElementById('wt-create-modal');
const wtDeleteModal = document.getElementById('wt-delete-modal');
const wtMergeModal = document.getElementById('wt-merge-modal');
const projectList = document.getElementById('project-list');

// ── Cross-module deps (injected via initWorktreeModals) ──
let _loadProjects;
let _openWorkDir;
let _closeTab;
let _tabsForWorkDir;
let _startTask;
let _doPullLatestMain;

// ── Worktree Context Menu ──────────────────────────────────────

export function showWorktreeContextMenu(x, y, worktreeItem) {
  modalState.wtContextTarget = worktreeItem;
  const isMain = worktreeItem.dataset.isMain === 'true';
  const isLocked = worktreeItem.dataset.isLocked === 'true';

  // Update lock/unlock label
  const lockItem = wtContextMenu.querySelector('[data-action="lock"]');
  if (isLocked) {
    lockItem.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Unlock';
  } else {
    lockItem.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Lock';
  }

  // Disable lock and remove for main worktree
  if (isMain) {
    lockItem.classList.add('disabled');
    lockItem.title = 'Cannot lock the main worktree';
  } else {
    lockItem.classList.remove('disabled');
    lockItem.title = '';
  }
  const removeItem = wtContextMenu.querySelector('[data-action="remove"]');
  if (isMain) {
    removeItem.classList.add('disabled');
    removeItem.title = 'Cannot remove the main worktree';
  } else {
    removeItem.classList.remove('disabled');
    removeItem.title = '';
  }
  const pullMainItem = wtContextMenu.querySelector('[data-action="pull-main"]');
  pullMainItem.classList.remove('disabled');
  pullMainItem.title = '';
  const mergeItem = wtContextMenu.querySelector('[data-action="merge"]');
  if (isMain) {
    mergeItem.classList.add('disabled');
    mergeItem.title = 'Cannot merge the main worktree into itself';
  } else {
    mergeItem.classList.remove('disabled');
    mergeItem.title = '';
  }

  // Position menu
  wtContextMenu.style.left = x + 'px';
  wtContextMenu.style.top = y + 'px';
  wtContextMenu.classList.add('active');

  // Adjust if off-screen
  requestAnimationFrame(() => {
    const rect = wtContextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) wtContextMenu.style.left = (x - rect.width) + 'px';
    if (rect.bottom > window.innerHeight) wtContextMenu.style.top = (y - rect.height) + 'px';
  });
}

// ── Create Worktree Modal ──────────────────────────────────────

export async function openWorktreeCreateModal(projectPath) {
  modalState.wtCreateProjectPath = projectPath;
  const createError = document.getElementById('wt-create-error');
  createError.textContent = '';
  createError.classList.remove('visible');

  // Reset form
  document.getElementById('wt-new-branch-check').checked = true;
  document.getElementById('wt-branch-name').value = '';
  document.getElementById('wt-branch-select-group').style.display = 'none';
  document.getElementById('wt-branch-name-group').style.display = '';

  // Load branches
  const branchSelect = document.getElementById('wt-branch-select');
  branchSelect.innerHTML = '<option value="">Loading...</option>';
  wtCreateModal.classList.add('active');
  document.getElementById('wt-branch-name').focus();

  const branches = await window.worktree.branches(projectPath);
  branchSelect.innerHTML = branches.length
    ? branches.map(b => `<option value="${b.replace(/"/g, '&quot;')}">${b}</option>`).join('')
    : '<option value="">No branches found</option>';

  // Auto-generate path from first branch
  updateWorktreePath();
}

function updateWorktreePath() {
  const isNew = document.getElementById('wt-new-branch-check').checked;
  const pathInput = document.getElementById('wt-path-input');
  let branchName;
  if (isNew) {
    branchName = document.getElementById('wt-branch-name').value.trim();
  } else {
    branchName = document.getElementById('wt-branch-select').value;
  }
  if (branchName && modalState.wtCreateProjectPath) {
    const parentDir = modalState.wtCreateProjectPath.replace(/\/[^/]+$/, '');
    const projectName = modalState.wtCreateProjectPath.split('/').pop();
    const safeName = branchName.replace(/\//g, '-');
    pathInput.value = `${parentDir}/${projectName}.worktrees/${safeName}`;
  }
}

// ── Delete Worktree Modal ──────────────────────────────────────

export function openWorktreeDeleteModal(projectPath, wtPath) {
  modalState.wtDeleteProjectPath = projectPath;
  modalState.wtDeletePath = wtPath;
  modalState.wtDeleteForce = false;
  document.getElementById('wt-delete-path').textContent = wtPath;
  document.getElementById('wt-delete-warning').classList.remove('visible');
  document.getElementById('wt-delete-confirm').textContent = 'Remove';
  document.getElementById('wt-delete-confirm').disabled = false;
  document.getElementById('wt-delete-branch-check').checked = true;
  wtDeleteModal.classList.add('active');
}

// ── Merge & Clean Up Modal ─────────────────────────────────────

export async function openMergeModal(projectPath, wtPath) {
  modalState.wtMergeProjectPath = projectPath;
  modalState.wtMergeWorktreePath = wtPath;
  modalState.wtMergeForce = false;
  modalState.wtMergeAlreadyMerged = false;
  modalState.wtMergeDone = false;
  modalState.wtMergeFeatureBranch = null;

  // Reset to loading state
  document.getElementById('wt-merge-loading').style.display = '';
  document.getElementById('wt-merge-info').style.display = 'none';
  document.getElementById('wt-merge-warning').classList.remove('visible');
  document.getElementById('wt-merge-success').classList.remove('visible');
  document.getElementById('wt-merge-confirm').textContent = 'Merge & Clean Up';
  document.getElementById('wt-merge-confirm').disabled = true;
  document.getElementById('wt-merge-cancel').style.display = '';
  document.getElementById('wt-merge-buttons').style.display = '';
  document.getElementById('wt-merge-open-merger').style.display = 'none';
  wtMergeModal.classList.add('active');

  const preflight = await window.worktree.mergePreflight(projectPath, wtPath);

  document.getElementById('wt-merge-loading').style.display = 'none';

  if (!preflight.ok) {
    const w = document.getElementById('wt-merge-warning');
    w.textContent = preflight.error;
    w.classList.add('visible');
    document.getElementById('wt-merge-confirm').disabled = true;
    return;
  }

  // Build summary
  const summaryEl = document.getElementById('wt-merge-summary');
  const commitsEl = document.getElementById('wt-merge-commits');
  document.getElementById('wt-merge-info').style.display = '';

  if (preflight.alreadyMerged) {
    modalState.wtMergeAlreadyMerged = true;
    summaryEl.innerHTML = `<strong>${preflight.featureBranch}</strong> is already merged into <strong>${preflight.targetBranch}</strong>`;
    commitsEl.innerHTML = '';
    document.getElementById('wt-merge-confirm').textContent = 'Clean Up';
    document.getElementById('wt-merge-confirm').disabled = false;
    return;
  }

  modalState.wtMergeFeatureBranch = preflight.featureBranch;
  summaryEl.innerHTML = `<strong>${preflight.featureBranch}</strong><span class="merge-arrow">\u2192</span><strong>${preflight.targetBranch}</strong><span class="merge-count">${preflight.commitCount} commit${preflight.commitCount !== 1 ? 's' : ''}</span>`;

  commitsEl.innerHTML = preflight.commits.map(c =>
    `<div><span class="commit-hash">${c.hash.slice(0, 7)}</span>${c.message}</div>`
  ).join('');

  if (preflight.isDirty) {
    const w = document.getElementById('wt-merge-warning');
    w.textContent = `This worktree has ${preflight.dirtyFileCount} uncommitted file${preflight.dirtyFileCount !== 1 ? 's' : ''}. Commit or stash changes before merging.`;
    w.classList.add('visible');
    document.getElementById('wt-merge-confirm').disabled = true;
    return;
  }

  if (preflight.isLocked) {
    modalState.wtMergeForce = true;
  }

  document.getElementById('wt-merge-confirm').disabled = false;
}

// ── Init (wires up all event listeners) ────────────────────────

export function initWorktreeModals({ loadProjects, openWorkDir, closeTab, tabsForWorkDir, startTask, doPullLatestMain }) {
  _loadProjects = loadProjects;
  _openWorkDir = openWorkDir;
  _closeTab = closeTab;
  _tabsForWorkDir = tabsForWorkDir;
  _startTask = startTask;
  _doPullLatestMain = doPullLatestMain;

  // ── Context menu dismiss ──
  document.addEventListener('click', () => wtContextMenu.classList.remove('active'));
  document.addEventListener('contextmenu', (e) => {
    if (!e.target.closest('#wt-context-menu') && !e.target.closest('.worktree-item')) {
      wtContextMenu.classList.remove('active');
    }
  });

  // ── Context menu actions ──
  wtContextMenu.addEventListener('click', async (e) => {
    const item = e.target.closest('.wt-ctx-item');
    if (!item || item.classList.contains('disabled') || !modalState.wtContextTarget) return;
    const action = item.dataset.action;
    const wtPath = modalState.wtContextTarget.dataset.path;
    const projectEntry = modalState.wtContextTarget.closest('.project-entry');
    const projectPath = projectEntry?.dataset.path;

    wtContextMenu.classList.remove('active');

    if (action === 'remove') {
      openWorktreeDeleteModal(projectPath, wtPath);
    } else if (action === 'lock') {
      const isLocked = modalState.wtContextTarget.dataset.isLocked === 'true';
      const result = await window.worktree.lock(projectPath, wtPath, isLocked);
      if (result.ok) {
        _loadProjects();
      } else {
        alert(`Failed to ${isLocked ? 'unlock' : 'lock'} worktree: ${result.error}`);
      }
    } else if (action === 'prune') {
      const result = await window.worktree.prune(projectPath);
      if (result.ok) {
        _loadProjects();
      } else {
        alert('Failed to prune worktrees: ' + result.error);
      }
    } else if (action === 'pull-main') {
      await _doPullLatestMain(wtPath);
    } else if (action === 'merge') {
      openMergeModal(projectPath, wtPath);
    }
  });

  // ── Create modal listeners ──
  document.getElementById('wt-new-branch-check').addEventListener('change', (e) => {
    document.getElementById('wt-branch-select-group').style.display = e.target.checked ? 'none' : '';
    document.getElementById('wt-branch-name-group').style.display = e.target.checked ? '' : 'none';
    updateWorktreePath();
  });

  document.getElementById('wt-branch-select').addEventListener('change', updateWorktreePath);
  document.getElementById('wt-branch-name').addEventListener('input', (e) => {
    const { selectionStart } = e.target;
    e.target.value = e.target.value.replace(/ /g, '-');
    e.target.setSelectionRange(selectionStart, selectionStart);
    updateWorktreePath();
  });

  document.getElementById('wt-branch-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('wt-create-btn').click();
  });

  document.getElementById('wt-create-cancel').addEventListener('click', () => {
    wtCreateModal.classList.remove('active');
  });

  wtCreateModal.addEventListener('click', (e) => {
    if (e.target === wtCreateModal) wtCreateModal.classList.remove('active');
  });

  document.getElementById('wt-create-btn').addEventListener('click', async () => {
    const createError = document.getElementById('wt-create-error');
    const isNew = document.getElementById('wt-new-branch-check').checked;
    const branch = isNew
      ? document.getElementById('wt-branch-name').value.trim()
      : document.getElementById('wt-branch-select').value;
    const wtPath = document.getElementById('wt-path-input').value.trim();

    if (!branch) {
      createError.textContent = 'Please specify a branch name.';
      createError.classList.add('visible');
      return;
    }
    if (!wtPath) {
      createError.textContent = 'Please specify a directory path.';
      createError.classList.add('visible');
      return;
    }

    const createBtn = document.getElementById('wt-create-btn');
    createBtn.disabled = true;
    createBtn.textContent = 'Creating...';
    createError.classList.remove('visible');

    const result = await window.worktree.add(modalState.wtCreateProjectPath, wtPath, branch, isNew);
    createBtn.disabled = false;
    createBtn.textContent = 'Create';

    if (result.ok) {
      wtCreateModal.classList.remove('active');
      // Mark project as expanded before loadProjects captures state
      const entry = projectList.querySelector(`.project-entry[data-path="${CSS.escape(modalState.wtCreateProjectPath)}"]`);
      if (entry) entry.classList.add('expanded');
      await _loadProjects();
      _openWorkDir(wtPath);
    } else {
      createError.textContent = result.error || 'Failed to create worktree.';
      createError.classList.add('visible');
    }
  });

  // ── Delete modal listeners ──
  document.getElementById('wt-delete-cancel').addEventListener('click', () => {
    wtDeleteModal.classList.remove('active');
  });

  wtDeleteModal.addEventListener('click', (e) => {
    if (e.target === wtDeleteModal) wtDeleteModal.classList.remove('active');
  });

  document.getElementById('wt-delete-confirm').addEventListener('click', async () => {
    const confirmBtn = document.getElementById('wt-delete-confirm');
    const warningEl = document.getElementById('wt-delete-warning');
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Removing...';

    const deleteBranch = document.getElementById('wt-delete-branch-check').checked;
    const result = await window.worktree.remove(modalState.wtDeleteProjectPath, modalState.wtDeletePath, modalState.wtDeleteForce, deleteBranch);
    confirmBtn.disabled = false;

    if (result.ok) {
      wtDeleteModal.classList.remove('active');
      // Close any tabs belonging to this worktree
      const tabIds = _tabsForWorkDir(modalState.wtDeletePath).map(([id]) => id);
      for (const tabId of tabIds) {
        await _closeTab(tabId);
      }
      _loadProjects();
    } else if ((result.isDirty || result.isLocked) && !modalState.wtDeleteForce) {
      // Show warning and offer force delete
      modalState.wtDeleteForce = true;
      let msg = '';
      if (result.isLocked) msg = 'This worktree is locked. ';
      if (result.isDirty) msg += 'This worktree has uncommitted changes that will be lost.';
      if (!msg) msg = result.error;
      warningEl.textContent = msg + ' Click "Force Remove" to proceed anyway.';
      warningEl.classList.add('visible');
      confirmBtn.textContent = 'Force Remove';
    } else {
      warningEl.textContent = result.error || 'Failed to remove worktree.';
      warningEl.classList.add('visible');
      confirmBtn.textContent = 'Remove';
    }
  });

  // ── Merge modal listeners ──
  document.getElementById('wt-merge-cancel').addEventListener('click', () => {
    wtMergeModal.classList.remove('active');
  });

  wtMergeModal.addEventListener('click', (e) => {
    if (e.target === wtMergeModal) wtMergeModal.classList.remove('active');
  });

  document.getElementById('wt-merge-open-merger').addEventListener('click', () => {
    wtMergeModal.classList.remove('active');
    const branch = modalState.wtMergeFeatureBranch;
    const projectPath = modalState.wtMergeProjectPath;
    const initialPrompt = `Resolve the merge conflicts for merging \`${branch}\` into the current branch.\n\nWorking directory (main repo): ${projectPath}\n\nRun: git -C '${projectPath}' merge '${branch}'\n\nThen resolve each conflicted file one by one. Use AskUserQuestion whenever you are unsure which side to keep.`;
    _startTask('merger', projectPath, { initialPrompt });
  });

  document.getElementById('wt-merge-confirm').addEventListener('click', async () => {
    if (modalState.wtMergeDone) {
      wtMergeModal.classList.remove('active');
      return;
    }

    const confirmBtn = document.getElementById('wt-merge-confirm');
    const cancelBtn = document.getElementById('wt-merge-cancel');
    const warningEl = document.getElementById('wt-merge-warning');
    const successEl = document.getElementById('wt-merge-success');
    confirmBtn.disabled = true;
    confirmBtn.textContent = modalState.wtMergeAlreadyMerged ? 'Cleaning up...' : 'Merging...';
    cancelBtn.style.display = 'none';

    const result = await window.worktree.mergeAndCleanup(modalState.wtMergeProjectPath, modalState.wtMergeWorktreePath, modalState.wtMergeForce);

    modalState.wtMergeDone = true;

    if (result.ok) {
      // Close tabs for the merged worktree
      const tabIds = _tabsForWorkDir(modalState.wtMergeWorktreePath).map(([id]) => id);
      for (const tabId of tabIds) {
        await _closeTab(tabId);
      }
      _loadProjects();

      document.getElementById('wt-merge-info').style.display = 'none';
      warningEl.classList.remove('visible');
      successEl.textContent = `Merged ${result.mergedBranch} into ${result.targetBranch}. Worktree and branch cleaned up.`;
      successEl.classList.add('visible');
      confirmBtn.textContent = 'Done';
      confirmBtn.disabled = false;
    } else if (result.hasConflicts) {
      warningEl.textContent = result.error;
      warningEl.classList.add('visible');
      confirmBtn.textContent = 'Close';
      confirmBtn.disabled = false;
      document.getElementById('wt-merge-open-merger').style.display = '';
    } else if (result.mergeSucceeded) {
      _loadProjects();
      successEl.textContent = `Merge succeeded, but cleanup failed: ${result.cleanupError}`;
      successEl.classList.add('visible');
      confirmBtn.textContent = 'Close';
      confirmBtn.disabled = false;
    } else {
      warningEl.textContent = result.error || 'Merge failed.';
      warningEl.classList.add('visible');
      confirmBtn.textContent = 'Close';
      confirmBtn.disabled = false;
    }
  });
}
