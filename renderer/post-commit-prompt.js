// ── Post-commit prompt banner ───────────────────────────────────
// Shows contextual next-step actions after the committer agent exits.
import { gitState, ghState } from './state.js';
import { escHtml } from './utils.js';

let _doPush = null;
let _showChangesStatus = null;
let _refreshWorktreeMetrics = null;
let _switchRightPanelTab = null;
let _refreshChanges = null;

export function initPostCommitPrompt({ doPush, showChangesStatus, refreshWorktreeMetrics, switchRightPanelTab, refreshChanges }) {
  _doPush = doPush;
  _showChangesStatus = showChangesStatus;
  _refreshWorktreeMetrics = refreshWorktreeMetrics;
  _switchRightPanelTab = switchRightPanelTab;
  _refreshChanges = refreshChanges;
}

/** Called synchronously from terminals.js onExit — just sets state. */
export function onCommitterExit(workDir) {
  gitState.postCommitPrompts.set(workDir, { timestamp: Date.now() });
}

/** Clears prompt state for a workDir. */
export function dismissPostCommitPrompt(workDir) {
  if (!gitState.postCommitPrompts.has(workDir)) return;
  gitState.postCommitPrompts.delete(workDir);
  if (_refreshChanges) _refreshChanges(workDir);
}

/**
 * Builds the banner DOM element. Called from createSectionEl in git-changes.js.
 * existingPR is populated asynchronously — null on first render.
 */
export function buildPostCommitSection(workDir, status, existingPR) {
  const div = status.mainDivergence;
  const el = document.createElement('div');
  el.className = 'post-commit-prompt';
  el.dataset.section = 'post-commit-prompt';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');

  // Determine base state
  // ahead === 0 means we're on the default branch (or a branch with nothing new vs main)
  const isMain = !div || (div.ahead === 0 && div.behind === 0);
  const hasUpstream = div?.hasUpstream ?? true;
  const pushAhead = div?.pushAhead ?? 0;
  const behind = div?.behind ?? 0;

  // Message
  let msg;
  if (!hasUpstream && div) {
    msg = 'Branch has no remote. Push to origin?';
  } else {
    const n = pushAhead;
    const noun = n === 1 ? 'commit' : 'commits';
    msg = `${n} ${noun} ready to push`;
  }

  // Build HTML
  let infoHtml = '';
  if (behind > 0) {
    infoHtml = `<div class="post-commit-prompt-info warning">${behind} commit${behind !== 1 ? 's' : ''} behind main</div>`;
  }

  let buttonsHtml = '';
  if (isMain) {
    buttonsHtml = `<button class="post-commit-prompt-btn primary" data-action="push">Push</button>`;
  } else if (existingPR) {
    buttonsHtml = `<button class="post-commit-prompt-btn primary" data-action="push">Push</button>`
      + `<button class="post-commit-prompt-btn secondary" data-action="view-pr" data-pr-number="${escHtml(String(existingPR.number))}">View PR #${escHtml(String(existingPR.number))}</button>`;
  } else {
    buttonsHtml = `<button class="post-commit-prompt-btn primary" data-action="push">Push</button>`
      + `<button class="post-commit-prompt-btn primary" data-action="push-pr">Push &amp; Create PR</button>`;
  }
  if (behind > 0) {
    buttonsHtml += `<button class="post-commit-prompt-btn secondary" data-action="pull-main">Pull Main</button>`;
  }
  buttonsHtml += `<button class="post-commit-prompt-btn dismiss" data-action="dismiss">Dismiss</button>`;

  el.innerHTML = `<div class="post-commit-prompt-msg">${escHtml(msg)}</div>${infoHtml}<div class="post-commit-prompt-actions">${buttonsHtml}</div>`;

  // Click delegation
  el.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    _handleAction(btn.dataset.action, workDir, btn, el);
  });

  // Fire async PR check and upgrade buttons when it resolves
  if (!isMain && !existingPR) {
    window.github.prForBranch(workDir).then(r => {
      if (r?.ok && r.pr && el.isConnected) {
        // Upgrade: replace "Push & Create PR" with "View PR"
        const pushPrBtn = el.querySelector('[data-action="push-pr"]');
        if (pushPrBtn) {
          pushPrBtn.dataset.action = 'view-pr';
          pushPrBtn.dataset.prNumber = r.pr.number;
          pushPrBtn.textContent = `View PR #${r.pr.number}`;
          pushPrBtn.classList.remove('primary');
          pushPrBtn.classList.add('secondary');
        }
      }
    }).catch(e => console.warn('Async PR check failed:', e));
  }

  return el;
}

async function _handleAction(action, workDir, btn, bannerEl) {
  if (!_doPush || !_switchRightPanelTab || !_refreshChanges) return;
  // Disable all buttons to prevent double-click
  const allBtns = bannerEl.querySelectorAll('.post-commit-prompt-btn');
  allBtns.forEach(b => b.disabled = true);

  try {
    if (action === 'push') {
      await _doPush(workDir, { autoUpstream: true });

    } else if (action === 'push-pr') {
      // Re-check for existing PR before proceeding
      let pr = null;
      try { pr = (await window.github.prForBranch(workDir))?.pr; } catch (e) { console.warn('PR check failed, proceeding:', e); }
      if (pr) {
        // PR already exists — just push
        const result = await _doPush(workDir, { autoUpstream: true });
        if (result.ok) {
          _switchRightPanelTab('github');
        }
        return;
      }
      const result = await _doPush(workDir, { autoUpstream: true });
      if (result.ok) {
        ghState.pendingPRForm = true;
        _switchRightPanelTab('github');
      }

    } else if (action === 'pull-main') {
      const { doPullLatestMain } = await import('./git-changes-modals.js');
      await doPullLatestMain(workDir);

    } else if (action === 'view-pr') {
      _switchRightPanelTab('github');

    } else if (action === 'dismiss') {
      dismissPostCommitPrompt(workDir);
    }
  } finally {
    // Re-enable on error (on success the banner is dismissed/gone)
    if (bannerEl.isConnected) {
      allBtns.forEach(b => b.disabled = false);
    }
  }
}

