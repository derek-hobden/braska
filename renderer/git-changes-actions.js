// ── Git changes body delegation — stage/unstage/discard/revert click handlers ──

import { tabState } from './state.js';
import { escHtml, statSpan, changeEntry } from './utils.js';

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

  _changesBody.addEventListener('click', async (e) => {
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

    // Review staged files
    if (e.target.closest('.review-staged')) {
      if (activeWorkDir) {
        _startTask('code-reviewer', activeWorkDir, {
          initialPrompt: 'Review the currently staged changes (git diff --cached). Provide feedback on code quality, potential bugs, and suggestions for improvement.'
        });
      } else {
        _showChangesStatus('No active directory', 'error');
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
  });
}
