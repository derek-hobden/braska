// ── GitHub PRs — list, detail, create form ──

import { tabState, ghState } from './state.js';
import { escHtml, timeAgo, ghExtLink } from './utils.js';
import { ghResetListeners, ghChecksBadge, ghReviewBadge, ghStateBadge, handleGhExternalClick } from './github-panel.js';
import { renderMarkdown } from './markdown.js';

let _loadProjects, _openWorkDir, _closeTab, _tabsForWorkDir, _refreshChanges;

export function initGitHubPRs({ loadProjects, openWorkDir, closeTab, tabsForWorkDir, refreshChanges }) {
  _loadProjects = loadProjects;
  _openWorkDir = openWorkDir;
  _closeTab = closeTab;
  _tabsForWorkDir = tabsForWorkDir;
  _refreshChanges = refreshChanges;
}

// ── PR list ────────────────────────────────────────────────────

export async function refreshGitHubPRs(workDir) {
  if (ghState.directPRNumber) {
    const n = ghState.directPRNumber;
    ghState.directPRNumber = null;
    return showGitHubPRDetail(workDir, n);
  }
  // Consume pendingPRForm flag — skip list and open form directly
  if (ghState.pendingPRForm) {
    ghState.pendingPRForm = false;
    return showGitHubPRForm(workDir);
  }

  const content = document.getElementById('gh-content');
  content.innerHTML = '<div class="gh-empty">Loading pull requests...</div>';

  const result = await window.github.prList(workDir, ghState.prFilter);
  if (!result.ok) {
    content.innerHTML = `<div class="gh-status-msg error">${escHtml(result.error)}</div>`;
    return;
  }

  let html = `<div class="gh-toolbar">
    <button class="gh-filter-btn${ghState.prFilter === 'open' ? ' active' : ''}" data-gh-pr-filter="open">Open</button>
    <button class="gh-filter-btn${ghState.prFilter === 'closed' ? ' active' : ''}" data-gh-pr-filter="closed">Closed</button>
    <button class="gh-filter-btn${ghState.prFilter === 'all' ? ' active' : ''}" data-gh-pr-filter="all">All</button>
    <button class="gh-action-btn" id="gh-pr-new-btn">+ New PR</button>
  </div>`;

  if (!result.data.length) {
    html += '<div class="gh-empty">No pull requests found</div>';
  } else {
    for (const pr of result.data) {
      html += `<div class="gh-item" data-gh-pr-number="${pr.number}" data-gh-row-url="${escHtml(pr.url || '')}">
        <span class="gh-item-number">#${pr.number}</span>
        <span class="gh-item-title">${escHtml(pr.title)}</span>
        ${ghStateBadge(pr.state, pr.isDraft)}
        ${ghChecksBadge(pr.statusCheckRollup)}
        ${ghReviewBadge(pr.reviewDecision)}
        ${ghExtLink(pr.url)}
      </div>`;
    }
  }
  const signal = ghResetListeners();
  content.innerHTML = html;

  content.addEventListener('click', (e) => {
    if (handleGhExternalClick(e)) return;
    const filterBtn = e.target.closest('.gh-filter-btn[data-gh-pr-filter]');
    if (filterBtn) {
      ghState.prFilter = filterBtn.dataset.ghPrFilter;
      refreshGitHubPRs(tabState.activeWorkDir);
      return;
    }
    if (e.target.closest('#gh-pr-new-btn')) {
      showGitHubPRForm(tabState.activeWorkDir);
      return;
    }
    const item = e.target.closest('.gh-item[data-gh-pr-number]');
    if (item) showGitHubPRDetail(tabState.activeWorkDir, parseInt(item.dataset.ghPrNumber));
  }, { signal });
}

// ── PR detail ──────────────────────────────────────────────────

export async function showGitHubPRDetail(workDir, number) {
  const content = document.getElementById('gh-content');
  content.innerHTML = '<div class="gh-empty">Loading PR details...</div>';

  const result = await window.github.prView(workDir, number);
  if (!result.ok) {
    content.innerHTML = `<div class="gh-detail"><button class="gh-detail-back">&larr; Back</button><div class="gh-status-msg error">${escHtml(result.error)}</div></div>`;
    content.querySelector('.gh-detail-back').addEventListener('click', () => refreshGitHubPRs(workDir));
    return;
  }

  const pr = result.data;
  let html = `<div class="gh-detail">
    <div class="gh-detail-header">
      <button class="gh-detail-back">&larr; PRs</button>
      ${ghStateBadge(pr.state, pr.isDraft)}
      ${ghReviewBadge(pr.reviewDecision)}
    </div>
    <div class="gh-detail-title">#${pr.number} ${escHtml(pr.title)}</div>
    <div class="gh-detail-meta">${escHtml((pr.author || {}).login || 'unknown')} &middot; ${escHtml(pr.headRefName)} &rarr; ${escHtml(pr.baseRefName)} &middot; +${pr.additions || 0} &minus;${pr.deletions || 0} &middot; ${timeAgo(pr.createdAt)}</div>`;

  if (pr.body) {
    html += `<div class="gh-detail-body markdown-body">${renderMarkdown(pr.body)}</div>`;
  }

  // Files
  if (pr.files && pr.files.length) {
    html += `<div class="gh-section-title">Changed files (${pr.files.length})</div><div class="gh-files-list">`;
    for (const f of pr.files) {
      html += `<div class="gh-file-item"><span class="gh-file-adds">+${f.additions}</span><span class="gh-file-dels">-${f.deletions}</span><span class="gh-file-name">${escHtml(f.path)}</span></div>`;
    }
    html += '</div>';
  }

  // Checks
  if (pr.statusCheckRollup && pr.statusCheckRollup.length) {
    html += `<div class="gh-section-title">Checks</div>`;
    for (const c of pr.statusCheckRollup) {
      const icon = c.conclusion === 'SUCCESS' ? '<span style="color:#3fb950">&#10003;</span>' :
                   c.conclusion === 'FAILURE' || c.conclusion === 'ERROR' ? '<span style="color:#f85149">&#10007;</span>' :
                   '<span style="color:#d29922">&#9679;</span>';
      html += `<div class="gh-checks-item"><span class="gh-checks-icon">${icon}</span>${escHtml(c.name || c.__typename || '')}</div>`;
    }
  }

  // Comments
  if (pr.comments && pr.comments.length) {
    html += `<div class="gh-section-title">Comments (${pr.comments.length})</div>`;
    for (const c of pr.comments) {
      html += `<div class="gh-comment"><span class="gh-comment-author">${escHtml((c.author || {}).login || 'unknown')}</span><span class="gh-comment-time">${timeAgo(c.createdAt)}</span><div class="gh-comment-body markdown-body">${renderMarkdown(c.body)}</div></div>`;
    }
  }

  // Comment form
  html += `<div class="gh-comment-form"><textarea placeholder="Add a comment..." id="gh-pr-comment-input"></textarea><button id="gh-pr-comment-submit">Comment</button></div>`;

  // Merge controls
  if (pr.state === 'OPEN') {
    html += `<div class="gh-merge-controls">
      <select id="gh-merge-method"><option value="merge">Merge</option><option value="squash" selected>Squash</option><option value="rebase">Rebase</option></select>
      <label class="gh-merge-opt"><input type="checkbox" id="gh-merge-delete-branch" checked /> Delete branch</label>
      <button class="gh-btn-success" id="gh-pr-merge-btn">Merge PR</button>
      <button class="gh-btn-danger" id="gh-pr-close-btn">Close</button>
    </div>`;
  }

  html += '</div>';
  const detailSignal = ghResetListeners();
  content.innerHTML = html;
  content.addEventListener('click', (e) => { handleGhExternalClick(e); }, { signal: detailSignal });

  content.querySelector('.gh-detail-back').addEventListener('click', () => refreshGitHubPRs(workDir));

  const commentSubmit = document.getElementById('gh-pr-comment-submit');
  if (commentSubmit) {
    commentSubmit.addEventListener('click', async () => {
      const input = document.getElementById('gh-pr-comment-input');
      const body = input.value.trim();
      if (!body) return;
      commentSubmit.disabled = true;
      commentSubmit.textContent = 'Posting...';
      const r = await window.github.prComment(workDir, number, body);
      if (r.ok) { showGitHubPRDetail(workDir, number); }
      else { commentSubmit.textContent = 'Error'; commentSubmit.disabled = false; }
    });
  }

  const mergeBtn = document.getElementById('gh-pr-merge-btn');
  if (mergeBtn) {
    mergeBtn.addEventListener('click', async () => {
      if (!confirm(`Merge PR #${number}? This cannot be undone.`)) return;
      const method = document.getElementById('gh-merge-method').value;
      const deleteBranch = document.getElementById('gh-merge-delete-branch').checked;
      mergeBtn.disabled = true;
      mergeBtn.textContent = 'Merging...';
      const r = await window.github.prMerge(workDir, number, method, deleteBranch);
      if (r.ok && r.worktreeCleanedUp) {
        // Worktree was removed — close its tabs
        const cleanDir = r.cleanedWorktreePath || workDir;
        const tabIds = _tabsForWorkDir?.(cleanDir).map(([id]) => id) || [];
        for (const tabId of tabIds) await _closeTab?.(tabId);
        _loadProjects?.();
        if (cleanDir === workDir) {
          // We were inside the removed worktree — switch to main
          _openWorkDir?.(r.mainWorktreePath);
          _refreshChanges?.(r.mainWorktreePath || workDir);
        } else {
          // We're in a different worktree (e.g. main) — refresh the PR view
          showGitHubPRDetail(workDir, number);
          _refreshChanges?.(workDir);
        }
      } else if (r.ok) {
        showGitHubPRDetail(workDir, number);
        _refreshChanges?.(workDir);
      } else {
        mergeBtn.textContent = 'Error';
        const msg = document.createElement('div');
        msg.className = 'gh-status-msg error';
        msg.textContent = r.error;
        mergeBtn.parentElement.after(msg);
      }
    });
  }

  const closeBtn = document.getElementById('gh-pr-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', async () => {
      if (!confirm(`Close PR #${number}?`)) return;
      closeBtn.disabled = true;
      closeBtn.textContent = 'Closing...';
      const r = await window.github.prClose(workDir, number);
      if (r.ok) { showGitHubPRDetail(workDir, number); }
      else { closeBtn.textContent = 'Error'; }
    });
  }
}

// ── PR create form ─────────────────────────────────────────────

async function showGitHubPRForm(workDir) {
  const content = document.getElementById('gh-content');
  const branches = await window.gitDiff.branchList(workDir);
  const currentBranch = await window.gitDiff.currentBranch(workDir);

  const branchName = (currentBranch || '').replace(/^refs\/heads\//, '');
  const suggestedTitle = branchName.replace(/[-_]/g, ' ').replace(/^\w/, c => c.toUpperCase());

  let branchOpts = '';
  const remoteBranches = (branches || []).filter(b => !b.startsWith('* '));
  for (const b of remoteBranches) {
    const name = b.trim();
    branchOpts += `<option value="${escHtml(name)}"${name === 'main' || name === 'master' ? ' selected' : ''}>${escHtml(name)}</option>`;
  }

  content.innerHTML = `<div class="gh-form">
    <button class="gh-detail-back" id="gh-pr-form-cancel-top">&larr; Back to PRs</button>
    <label>Base branch</label>
    <select id="gh-pr-base">${branchOpts}</select>
    <label>Title</label>
    <input id="gh-pr-title" value="${escHtml(suggestedTitle)}" />
    <label>Description</label>
    <textarea id="gh-pr-body" placeholder="Describe your changes..."></textarea>
    <div class="gh-form-row">
      <input type="checkbox" id="gh-pr-draft" /><label for="gh-pr-draft">Draft</label>
    </div>
    <div class="gh-form-buttons">
      <button class="gh-btn-cancel" id="gh-pr-form-cancel">Cancel</button>
      <button class="gh-btn-primary" id="gh-pr-form-submit">Create Pull Request</button>
    </div>
    <div id="gh-pr-form-status"></div>
  </div>`;

  const cancel = () => refreshGitHubPRs(workDir);
  document.getElementById('gh-pr-form-cancel').addEventListener('click', cancel);
  document.getElementById('gh-pr-form-cancel-top').addEventListener('click', cancel);

  document.getElementById('gh-pr-form-submit').addEventListener('click', async () => {
    const title = document.getElementById('gh-pr-title').value.trim();
    const body = document.getElementById('gh-pr-body').value.trim();
    const base = document.getElementById('gh-pr-base').value;
    const draft = document.getElementById('gh-pr-draft').checked;
    const status = document.getElementById('gh-pr-form-status');
    const submitBtn = document.getElementById('gh-pr-form-submit');
    if (!title) { status.className = 'gh-status-msg error'; status.textContent = 'Title is required'; return; }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating...';
    status.className = 'gh-status-msg';
    status.textContent = 'Pushing branch and creating PR...';
    // Ensure branch is pushed
    try { await window.gitOps.pushSetUpstream(workDir, branchName); } catch (pushErr) {
      status.className = 'gh-status-msg error';
      status.textContent = 'Push failed: ' + (pushErr.message || pushErr);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Pull Request';
      return;
    }
    const r = await window.github.prCreate(workDir, title, body, base, draft);
    if (r.ok) {
      status.className = 'gh-status-msg success';
      status.textContent = 'PR created: ' + r.url;
      setTimeout(() => { ghState.prFilter = 'open'; refreshGitHubPRs(workDir); }, 1500);
    } else {
      status.className = 'gh-status-msg error';
      status.textContent = r.error;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Pull Request';
    }
  });
}
