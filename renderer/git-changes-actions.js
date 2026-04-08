// ── Git changes body delegation — stage/unstage/discard/revert click handlers ──

import { tabState } from './state.js';
import { escHtml, statSpan, changeEntry } from './utils.js';

// ── Review-loop prompt ───────────────────────────────────────
const REVIEW_LOOP_PROMPT = `You are running an automated review loop on this project's unstaged git changes. Follow these steps precisely:

STEP 1 — REVIEW: Use the Agent tool to spawn a code-reviewer agent with this prompt: "Review all unstaged changes (git diff). For each file, give a clear PASS or FAIL verdict with specific feedback for any failures." Wait for the review to complete and parse the results.

STEP 2 — STAGE PASSING FILES: For every file that received a PASS verdict, run \`git add <file>\` to stage it. Report which files were staged.

STEP 3 — FIX FAILING FILES: For each file that received a FAIL verdict, use the Agent tool to spawn a programmer sub-agent with this prompt: "Fix the following code review feedback in <file>: <feedback>". The sub-agent has full edit access. Wait for all fixes to complete.

STEP 4 — LOOP: After all fixes are applied, go back to STEP 1 to re-review the remaining unstaged changes. Repeat until the code-reviewer gives all files a PASS verdict and all changed files are staged.

STEP 5 — DONE: When there are no more unstaged changes (git diff returns empty), report the final summary of what was reviewed, fixed, and staged.

Important rules:
- Never stage a file that has not passed review.
- When spawning the code-reviewer agent, use: subagent_type="code-reviewer"
- When spawning programmer agents for fixes, use the default Agent (no subagent_type) with clear instructions about what file to fix and what the reviewer said.
- If a file fails review 3 times in a row, skip it and report it as needing manual attention.
- If you have completed 5 full review cycles and files still fail, stop and report the remaining failures.
- Always run \`git diff --stat\` before each review cycle to confirm what files remain unstaged.`;

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

  // Toolbar review buttons (outside changesBody, need direct listeners)
  document.getElementById('changes-review-btn').addEventListener('click', () => {
    const activeWorkDir = tabState.activeWorkDir;
    if (activeWorkDir) {
      _startTask('code-reviewer', activeWorkDir, {
        initialPrompt: 'Review all current git changes (staged, unstaged, and untracked). Use `git diff --cached` for staged changes and `git diff` for unstaged changes. Provide feedback on code quality, potential bugs, and suggestions for improvement.'
      });
    } else {
      _showChangesStatus('No active directory', 'error');
    }
  });
  document.getElementById('changes-review-loop-btn').addEventListener('click', () => {
    const activeWorkDir = tabState.activeWorkDir;
    if (activeWorkDir) {
      _startTask('__CLAUDE__', activeWorkDir, { initialPrompt: REVIEW_LOOP_PROMPT });
    } else {
      _showChangesStatus('No active directory', 'error');
    }
  });

  // Collapsible section headers (commits)
  _changesBody.addEventListener('click', (e) => {
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
