// ── Git changes body delegation — stage/unstage/discard/revert click handlers ──

import { tabState } from './state.js';
import { escHtml, statSpan, changeEntry } from './utils.js';
import { openCommitModal } from './git-changes-modals.js';

// Review-loop prompt moved to journey-zone.js

// ── Deps (injected via initChangesActions) ─────────────────────
let _refreshChanges = null;
let _showChangesStatus = null;
let _refreshWorktreeMetrics = null;
let _openDiffTab = null;
let _startTask = null;
let _changesBody = null;

export function initChangesActions(deps) {
  _refreshChanges = deps.refreshChanges;
  _showChangesStatus = deps.showChangesStatus;
  _refreshWorktreeMetrics = deps.refreshWorktreeMetrics;
  _openDiffTab = deps.openDiffTab;
  _startTask = deps.startTask;
  _changesBody = deps.changesBody;
  const _commitsBody = deps.commitsBody;

  // Collapsible section headers (commits — lives in commitsBody now)
  _commitsBody.addEventListener('click', (e) => {
    const header = e.target.closest('.changes-section-collapsible');
    if (!header) return;
    const section = header.closest('.changes-section');
    if (!section) return;
    const entries = section.querySelector('.changes-section-entries');
    if (!entries) return;
    const isCollapsed = header.classList.toggle('collapsed');
    section.classList.toggle('commits-collapsed', isCollapsed);
    header.querySelector('.changes-section-chevron').textContent = isCollapsed ? '▸' : '▾';
    entries.style.display = isCollapsed ? 'none' : '';
    localStorage.setItem('braska-commits-collapsed', isCollapsed);
  });

  // Register the main click handler on both changesBody (file sections) and commitsBody (commits/stashes)
  const _handleBodyClick = async (e) => {
    const activeWorkDir = tabState.activeWorkDir;

    // Stage button
    const stageBtnEl = e.target.closest('.changes-stage');
    if (stageBtnEl) {
      e.stopPropagation();
      const fileEl = stageBtnEl.closest('.changes-file');
      const file = fileEl.dataset.file;
      if (file && activeWorkDir) {
        const result = await window.gitOps.stage(activeWorkDir, [file]);
        if (result.ok) { _showChangesStatus('Staged', 'success'); _refreshChanges(activeWorkDir); _refreshWorktreeMetrics(); }
        else _showChangesStatus('Stage failed', 'error');
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
        if (result.ok) { _showChangesStatus('Unstaged', 'success'); _refreshChanges(activeWorkDir); _refreshWorktreeMetrics(); }
        else _showChangesStatus('Unstage failed', 'error');
      }
      return;
    }

    // Stash pop
    const stashPopBtn = e.target.closest('.changes-stash-btn.pop');
    if (stashPopBtn) {
      const idx = parseInt(stashPopBtn.dataset.index);
      if (activeWorkDir) {
        const result = await window.gitOps.stashPop(activeWorkDir, idx);
        if (result.ok) { _showChangesStatus('Stash popped', 'success'); _refreshChanges(activeWorkDir); _refreshWorktreeMetrics(); }
        else {
          if (result.hasConflicts) { _refreshChanges(activeWorkDir); _refreshWorktreeMetrics(); }
          _showChangesStatus(result.hasConflicts ? 'Conflicts on stash pop — resolve manually' : (result.error || '').split('\n')[0], 'error');
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
        if (result.ok) { _showChangesStatus('Stash dropped', 'success'); _refreshChanges(activeWorkDir); _refreshWorktreeMetrics(); }
        else _showChangesStatus((result.error || '').split('\n')[0], 'error');
      }
      return;
    }

    // Folder-level actions (tree view). Each folder header carries the descendant
    // file list as JSON on data-folder-files; the action button class identifies the op.
    const folderActionBtn = e.target.closest('.changes-folder-action');
    if (folderActionBtn) {
      e.stopPropagation();
      if (!activeWorkDir) return;
      const folderEl = folderActionBtn.closest('.changes-tree-folder');
      if (!folderEl) return;
      let files = [];
      try { files = JSON.parse(folderEl.dataset.folderFiles || '[]'); } catch { files = []; }
      if (!files.length) return;
      const label = folderEl.dataset.folderLabel || '';
      const count = files.length;
      const noun = count === 1 ? 'file' : 'files';

      if (folderActionBtn.classList.contains('changes-folder-stage')) {
        const result = await window.gitOps.stage(activeWorkDir, files);
        if (result.ok) { _showChangesStatus(`Staged ${count} ${noun} in ${label}`, 'success'); _refreshChanges(activeWorkDir); _refreshWorktreeMetrics(); }
        else _showChangesStatus('Stage failed', 'error');
        return;
      }
      if (folderActionBtn.classList.contains('changes-folder-unstage')) {
        const result = await window.gitOps.unstage(activeWorkDir, files);
        if (result.ok) { _showChangesStatus(`Unstaged ${count} ${noun} in ${label}`, 'success'); _refreshChanges(activeWorkDir); _refreshWorktreeMetrics(); }
        else _showChangesStatus('Unstage failed', 'error');
        return;
      }
      if (folderActionBtn.classList.contains('changes-folder-discard')) {
        if (!confirm(`Discard unstaged changes to ${count} ${noun} in ${label}? This cannot be undone.`)) return;
        const result = await window.gitOps.discard(activeWorkDir, files);
        if (result.ok) { _showChangesStatus(`Discarded ${count} ${noun} in ${label}`, 'success'); _refreshChanges(activeWorkDir); _refreshWorktreeMetrics(); }
        else _showChangesStatus('Discard failed: ' + (result.error || '').split('\n')[0], 'error');
        return;
      }
      if (folderActionBtn.classList.contains('changes-folder-delete')) {
        if (!confirm(`Permanently delete all ${count} ${noun} in ${label}? This cannot be undone.`)) return;
        const result = await window.gitOps.deleteUntracked(activeWorkDir, files);
        if (result.ok) { _showChangesStatus(`Deleted ${count} ${noun} in ${label}`, 'success'); _refreshChanges(activeWorkDir); _refreshWorktreeMetrics(); }
        else _showChangesStatus('Delete failed: ' + (result.error || '').split('\n')[0], 'error');
        return;
      }
      return;
    }

    // Unstage all
    if (e.target.closest('.unstage-all')) {
      if (activeWorkDir) {
        const files = [..._changesBody.querySelectorAll('[data-staged="true"]')].map(el => el.dataset.file);
        if (files.length) {
          const result = await window.gitOps.unstage(activeWorkDir, files);
          if (result.ok) { _showChangesStatus('Unstaged all', 'success'); _refreshChanges(activeWorkDir); _refreshWorktreeMetrics(); }
          else _showChangesStatus('Unstage failed', 'error');
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
        if (result.ok) { _showChangesStatus('Changes discarded', 'success'); _refreshChanges(activeWorkDir); _refreshWorktreeMetrics(); }
        else _showChangesStatus('Discard failed: ' + (result.error || '').split('\n')[0], 'error');
      }
      return;
    }

    // Discard all unstaged changes
    if (e.target.closest('.discard-all-unstaged')) {
      e.stopPropagation();
      if (activeWorkDir) {
        const files = [..._changesBody.querySelectorAll('[data-staged="false"]')].map(el => el.dataset.file);
        if (files.length && confirm(`Discard all ${files.length} changes? This cannot be undone.`)) {
          const result = await window.gitOps.discard(activeWorkDir, files);
          if (result.ok) { _showChangesStatus('All changes discarded', 'success'); _refreshChanges(activeWorkDir); _refreshWorktreeMetrics(); }
          else _showChangesStatus('Discard failed: ' + (result.error || '').split('\n')[0], 'error');
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
          _showChangesStatus('Commit reverted', 'success');
          _refreshChanges(activeWorkDir);
          _refreshWorktreeMetrics();
        } else {
          if (result.hasConflicts) {
            revertBtn.textContent = 'Revert';
            revertBtn.disabled = false;
            _refreshChanges(activeWorkDir);
            _refreshWorktreeMetrics();
            _showChangesStatus('Revert conflicts — resolve manually then commit', 'error');
          } else {
            revertBtn.textContent = 'Revert';
            revertBtn.disabled = false;
            _showChangesStatus('Revert failed: ' + (result.error || '').split('\n')[0], 'error');
          }
        }
      }
      return;
    }

    // Commit staged changes — opens commit modal
    if (e.target.closest('.commit-staged')) {
      e.stopPropagation();
      if (activeWorkDir) openCommitModal(activeWorkDir);
      return;
    }

    // Stage all unstaged changes
    if (e.target.closest('.stage-all-unstaged')) {
      if (activeWorkDir) {
        const files = [..._changesBody.querySelectorAll('[data-staged="false"]')].map(el => el.dataset.file);
        if (files.length) {
          const result = await window.gitOps.stage(activeWorkDir, files);
          if (result.ok) { _showChangesStatus('Staged all', 'success'); _refreshChanges(activeWorkDir); _refreshWorktreeMetrics(); }
          else _showChangesStatus('Stage failed', 'error');
        }
      }
      return;
    }

    // Stage all untracked
    if (e.target.closest('.stage-all-untracked')) {
      if (activeWorkDir) {
        const files = [..._changesBody.querySelectorAll('[data-untracked="true"]')].map(el => el.dataset.file);
        if (files.length) {
          const result = await window.gitOps.stage(activeWorkDir, files);
          if (result.ok) { _showChangesStatus('Staged all', 'success'); _refreshChanges(activeWorkDir); _refreshWorktreeMetrics(); }
          else _showChangesStatus('Stage failed', 'error');
        }
      }
      return;
    }

    // Delete single untracked file
    if (e.target.closest('.changes-delete-untracked')) {
      e.stopPropagation();
      const fileEl = e.target.closest('.changes-file');
      const file = fileEl?.dataset.file;
      if (file && activeWorkDir && confirm(`Permanently delete ${file}? This cannot be undone.`)) {
        const result = await window.gitOps.deleteUntracked(activeWorkDir, [file]);
        if (result.ok) { _showChangesStatus('File deleted', 'success'); _refreshChanges(activeWorkDir); _refreshWorktreeMetrics(); }
        else _showChangesStatus('Delete failed: ' + (result.error || '').split('\n')[0], 'error');
      }
      return;
    }

    // Delete all untracked files
    if (e.target.closest('.delete-all-untracked')) {
      e.stopPropagation();
      if (activeWorkDir) {
        const files = [..._changesBody.querySelectorAll('[data-untracked="true"]')].map(el => el.dataset.file);
        if (files.length && confirm(`Permanently delete all ${files.length} untracked file${files.length === 1 ? '' : 's'}? This cannot be undone.`)) {
          const result = await window.gitOps.deleteUntracked(activeWorkDir, files);
          if (result.ok) { _showChangesStatus('Untracked files deleted', 'success'); _refreshChanges(activeWorkDir); _refreshWorktreeMetrics(); }
          else _showChangesStatus('Delete failed: ' + (result.error || '').split('\n')[0], 'error');
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
        _openDiffTab(activeWorkDir, file, false, commitHash);
      } else {
        _openDiffTab(activeWorkDir, file, staged, null);
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
  };
  _changesBody.addEventListener('click', _handleBodyClick);
  _commitsBody.addEventListener('click', _handleBodyClick);
}
