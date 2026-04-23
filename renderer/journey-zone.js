// ── Journey Zone — contextual action cards for the source control panel ──
// State-driven cards that appear/disappear based on git state.
// Airport, not cockpit — show the next gate, not the entire route.

import { tabState, gitState, ghState } from './state.js';
import { escHtml } from './utils.js';
import { reconcileChildren } from './dom-patch.js';
import { computeJourneyCards } from './journey-cards.mjs';

// ── Deps (injected via initJourneyZone) ───────────────────────
let _doPush = null;
let _doPullLatestMain = null;
let _openBranchModal = null;
let _refreshChanges = null;
let _showChangesStatus = null;
let _startTask = null;
let _refreshWorktreeMetrics = null;
let _loadProjects = null;
let _openWorkDir = null;

export function initJourneyZone(deps) {
  _doPush = deps.doPush;
  _doPullLatestMain = deps.doPullLatestMain;
  _openBranchModal = deps.openBranchModal;
  _refreshChanges = deps.refreshChanges;
  _showChangesStatus = deps.showChangesStatus;
  _startTask = deps.startTask;
  _refreshWorktreeMetrics = deps.refreshWorktreeMetrics;
  _loadProjects = deps.loadProjects;
  _openWorkDir = deps.openWorkDir;

  // Branch name click → open branch modal
  document.getElementById('branch-name-btn')?.addEventListener('click', () => {
    if (_openBranchModal) _openBranchModal();
  });

  // Overflow menu toggle
  const overflowBtn = document.getElementById('branch-overflow-btn');
  const overflowMenu = document.getElementById('branch-overflow-menu');
  overflowBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    overflowMenu.style.display = overflowMenu.style.display === 'none' ? '' : 'none';
  });
  document.addEventListener('click', () => { if (overflowMenu) overflowMenu.style.display = 'none'; });

  // Overflow menu actions
  overflowMenu?.addEventListener('click', (e) => {
    const item = e.target.closest('[data-action]');
    if (!item) return;
    overflowMenu.style.display = 'none';
    _handleOverflowAction(item.dataset.action);
  });

  // Journey zone click delegation
  document.getElementById('journey-zone')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-journey-action]');
    if (!btn || btn.disabled) return;
    _handleJourneyAction(btn.dataset.journeyAction, btn);
  });
}

// ── Post-commit state (migrated from post-commit-prompt.js) ────
export function onCommitterExit(workDir) {
  gitState.postCommitPrompts.set(workDir, { timestamp: Date.now() });
}

export function dismissPostCommitPrompt(workDir) {
  if (!gitState.postCommitPrompts.has(workDir)) return;
  gitState.postCommitPrompts.delete(workDir);
  if (_refreshChanges) _refreshChanges(workDir);
}

// ── Render journey zone cards ──────────────────────────────────
export function renderJourneyZone(status) {
  const zone = document.getElementById('journey-zone');
  if (!zone) return;
  const workDir = tabState.activeWorkDir;
  const mergeInfo = gitState.mergedToMain.get(workDir) || null;
  const cards = computeJourneyCards(status, { mergeInfo });
  _renderCards(zone, cards);
}

// ── Render helper — reconcile cards into the zone DOM ──────────
function _renderCards(zone, cards) {
  // Max 2 visible cards
  const visible = cards.slice(0, 2);
  const overflow = cards.slice(2);

  zone.style.display = visible.length > 0 ? '' : 'none';

  const cardEls = visible.map(card => ({ key: card.key, card }));
  if (overflow.length > 0) {
    const overflowLabel = `+${overflow.length}: ${overflow[0].title}`;
    cardEls.push({ key: '_overflow', overflowLabel });
  }

  reconcileChildren(zone, cardEls, 'journeyCard',
    item => item.key,
    item => item.overflowLabel ? _createOverflowEl(item.overflowLabel) : _createCardEl(item.card),
    (el, item) => {
      if (item.overflowLabel) { el.textContent = item.overflowLabel; return; }
      const titleEl = el.querySelector('.journey-card-title');
      if (titleEl) titleEl.innerHTML = `<span class="journey-card-dot"></span>${escHtml(item.card.title)}`;
      const subEl = el.querySelector('.journey-card-subtitle');
      if (subEl && item.card.subtitle) subEl.innerHTML = _subtitleHtml(item.card.subtitle, item.card.subtitleAction);
      else if (subEl && !item.card.subtitle) subEl.remove();
    },
  );
}

// ── Card DOM builders ──────────────────────────────────────────

function _subtitleHtml(text, action) {
  if (action) return `${escHtml(text)} <a class="journey-card-subtitle-link" data-journey-action="${action}">\u2190 update</a>`;
  return escHtml(text);
}

function _createCardEl(card) {
  const el = document.createElement('div');
  el.className = `journey-card journey-card-${card.accent}`;
  let html = `<div class="journey-card-title"><span class="journey-card-dot"></span>${escHtml(card.title)}</div>`;
  if (card.subtitle) {
    html += `<div class="journey-card-subtitle">${_subtitleHtml(card.subtitle, card.subtitleAction)}</div>`;
  }
  html += '<div class="journey-card-actions">';
  for (const btn of card.buttons) {
    const cls = btn.primary ? 'journey-card-btn primary' : 'journey-card-btn secondary';
    html += `<button class="${cls}" data-journey-action="${btn.action}" title="${escHtml(card.tooltip || '')}">${escHtml(btn.label)}</button>`;
  }
  html += '</div>';
  el.innerHTML = html;
  return el;
}

function _createOverflowEl(label) {
  const el = document.createElement('div');
  el.className = 'journey-more';
  el.textContent = label;
  return el;
}

// ── Action handlers ────────────────────────────────────────────

const REVIEW_LOOP_PROMPT = `Run an automated review loop on unstaged git changes:
1. Spawn a code-reviewer agent (subagent_type="code-reviewer") to review all unstaged changes (git diff). Each file gets PASS or FAIL with specific feedback.
2. Stage all PASS files with git add. Report which files were staged.
3. For each FAIL file, spawn a programmer sub-agent (default Agent) to fix the feedback. Wait for all fixes.
4. Loop back to step 1. Repeat until all files pass and are staged, or 5 cycles complete.
5. When git diff returns empty, report summary. Skip files that fail 3 times. Run git diff --stat before each cycle.`;

const PUBLISH_PR_PROMPT = `Push this branch to origin and open a pull request.

1. Inspect the branch: run \`git status\`, \`git log --oneline main..HEAD\` (or the appropriate base), and \`git diff main...HEAD --stat\` so you understand what has changed and why.
2. Push the current branch to origin. If it has no upstream yet, use \`git push -u origin HEAD\`.
3. Create the PR with \`gh pr create --base main\`, passing \`--title\` and \`--body\`. Craft them carefully:
   - Title: concise, imperative, under 70 characters, summarizing the overall change.
   - Body: a short "## Summary" (2–4 bullets on WHAT changed) followed by a "## Why" section (the motivation — the problem being solved or the behavior being improved). If relevant, add a "## Notes" section for caveats, follow-ups, or anything a reviewer should know. Pass the body via a heredoc so newlines and markdown are preserved.
4. When the PR is created, print the PR URL so the user can open it.

Do not amend commits, force-push, or change branch history — just push what is there and open the PR.`;

async function _handleJourneyAction(action, btn) {
  const workDir = tabState.activeWorkDir;
  if (!workDir) return;

  if (action === 'commit') {
    dismissPostCommitPrompt(workDir);
    for (const tab of tabState.tabs.values()) {
      if (tab.agentName === 'committer' && tab.workDir === workDir) {
        _showChangesStatus?.('Committer already running', 'error');
        return;
      }
    }
    _startTask?.('committer', workDir, {
      initialPrompt: 'Commit all current changes in this working directory. Group them into logical batches with clear commit messages.',
    });

  } else if (action === 'review') {
    for (const tab of tabState.tabs.values()) {
      if (tab.agentName === 'reviewer' && tab.workDir === workDir) {
        _showChangesStatus?.('Reviewer already running', 'error');
        return;
      }
    }
    _startTask?.('reviewer', workDir, { initialPrompt: REVIEW_LOOP_PROMPT });

  } else if (action === 'pull') {
    btn.disabled = true;
    btn.textContent = 'Pulling...';
    try {
      const result = await window.gitOps.pull(workDir);
      if (result.ok) { _showChangesStatus?.('Pulled', 'success'); _refreshChanges?.(workDir); _refreshWorktreeMetrics?.(); }
      else if (result.hasConflicts) { _refreshChanges?.(workDir); _refreshWorktreeMetrics?.(); _showChangesStatus?.('Pull conflicts \u2014 resolve and commit', 'error'); }
      else _showChangesStatus?.('Pull failed: ' + (result.error || '').split('\n')[0], 'error');
    } finally { btn.disabled = false; btn.textContent = 'Pull'; }

  } else if (action === 'pull-main') {
    _doPullLatestMain?.(workDir);

  } else if (action === 'push') {
    btn.disabled = true;
    btn.textContent = 'Pushing...';
    try { await _doPush?.(workDir, { autoUpstream: false }); }
    finally { btn.disabled = false; btn.textContent = 'Push'; }

  } else if (action === 'push-pr' || action === 'publish-pr') {
    _startTask?.('github-specialist', workDir, { initialPrompt: PUBLISH_PR_PROMPT });

  } else if (action === 'merge-to-main') {
    btn.disabled = true;
    btn.textContent = 'Merging...';
    try {
      const result = await window.worktree.mergeToMain(workDir);
      if (result.ok) {
        gitState.mergedToMain.set(workDir, {
          featureBranch: result.featureBranch,
          targetBranch: result.targetBranch,
          mainWorktreePath: result.mainWorktreePath,
        });
        _showChangesStatus?.(`Merged into ${result.targetBranch}`, 'success');
        _refreshChanges?.(workDir);
        _refreshWorktreeMetrics?.();
      } else if (result.hasConflicts) {
        _showChangesStatus?.(result.error, 'error');
      } else if (result.isDirty) {
        _showChangesStatus?.(result.error, 'error');
      } else if (result.alreadyMerged) {
        _showChangesStatus?.(result.error, 'info');
      } else {
        _showChangesStatus?.('Merge failed: ' + (result.error || '').split('\n')[0], 'error');
      }
    } finally { btn.disabled = false; btn.textContent = 'Merge to main'; }

  } else if (action === 'push-main') {
    btn.disabled = true;
    btn.textContent = 'Pushing main...';
    try {
      const result = await window.worktree.pushMain(workDir);
      if (result.ok) {
        _showChangesStatus?.(`Pushed ${result.targetBranch}`, 'success');
        // Clear merge state after successful push
        gitState.mergedToMain.delete(workDir);
        _refreshChanges?.(workDir);
        _refreshWorktreeMetrics?.();
      } else {
        _showChangesStatus?.('Push failed: ' + (result.error || '').split('\n')[0], 'error');
      }
    } finally { btn.disabled = false; btn.textContent = 'Push main'; }

  } else if (action === 'cleanup-branch') {
    const mergeInfo = gitState.mergedToMain.get(workDir);
    if (!mergeInfo) return;
    if (!confirm(`Remove worktree and delete branch "${mergeInfo.featureBranch}"?`)) return;
    btn.disabled = true;
    btn.textContent = 'Cleaning up...';
    try {
      const result = await window.worktree.remove(mergeInfo.mainWorktreePath, workDir, false, true);
      if (result.ok) {
        gitState.mergedToMain.delete(workDir);
        _showChangesStatus?.('Branch cleaned up', 'success');
        _loadProjects?.();
        if (mergeInfo.mainWorktreePath) _openWorkDir?.(mergeInfo.mainWorktreePath);
      } else {
        _showChangesStatus?.('Cleanup failed: ' + (result.error || '').split('\n')[0], 'error');
      }
    } finally { btn.disabled = false; btn.textContent = 'Clean up branch'; }

  } else if (action === 'open-merger') {
    _startTask?.('merger', workDir, {
      initialPrompt: 'Resolve all merge conflicts in this repository. Check git status, open conflicting files, resolve the conflicts, stage, and commit.',
    });
  }
}

function _handleOverflowAction(action) {
  const workDir = tabState.activeWorkDir;
  if (!workDir) return;

  if (action === 'fetch') {
    window.gitOps.fetch(workDir).then(result => {
      if (result.ok) { _showChangesStatus?.('Fetched', 'success'); _refreshChanges?.(workDir); _refreshWorktreeMetrics?.(); }
      else _showChangesStatus?.('Fetch failed: ' + (result.error || '').split('\n')[0], 'error');
    });
  } else if (action === 'stash') {
    window.gitOps.stashSave(workDir, '').then(result => {
      if (result.ok) { _showChangesStatus?.('Stashed', 'success'); _refreshChanges?.(workDir); _refreshWorktreeMetrics?.(); }
      else _showChangesStatus?.((result.error || 'Stash failed').split('\n')[0], 'error');
    });
  } else if (action === 'discard-all') {
    const changesBody = document.getElementById('changes-body');
    const files = [...changesBody.querySelectorAll('[data-staged="false"]')].map(el => el.dataset.file);
    if (files.length && confirm(`Discard all ${files.length} changes? This cannot be undone.`)) {
      window.gitOps.discard(workDir, files).then(result => {
        if (result.ok) { _showChangesStatus?.('All changes discarded', 'success'); _refreshChanges?.(workDir); _refreshWorktreeMetrics?.(); }
        else _showChangesStatus?.('Discard failed', 'error');
      });
    }
  } else if (action === 'tree-toggle') {
    gitState.changesTreeView = !gitState.changesTreeView;
    localStorage.setItem('braska-changes-tree-view', gitState.changesTreeView);
    _refreshChanges?.(workDir);
  }
}
