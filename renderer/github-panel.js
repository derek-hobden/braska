// ── GitHub panel module ─────────────────────────────────────────
// Extracted from the monolithic renderer. Handles PRs, issues, CI,
// and notifications via the GitHub CLI bridge (window.github).

import { tabState, ghState } from './state.js';
import { escHtml, timeAgo } from './utils.js';

// ── Cross-module deps injected via init ─────────────────────────
let _startTask = null;
let _switchRightPanelTab = null;

export function initGitHubPanel({ startTask, switchRightPanelTab }) {
  _startTask = startTask;
  _switchRightPanelTab = switchRightPanelTab;
}

// ── Helpers ─────────────────────────────────────────────────────

function ghResetListeners() {
  if (ghState.contentAC) ghState.contentAC.abort();
  ghState.contentAC = new AbortController();
  return ghState.contentAC.signal;
}

function ghChecksBadge(rollup) {
  if (!rollup || !rollup.length) return '';
  const fail = rollup.some(c => c.conclusion === 'FAILURE' || c.conclusion === 'ERROR');
  const pending = rollup.some(c => !c.conclusion || c.state === 'PENDING' || c.state === 'QUEUED' || c.state === 'IN_PROGRESS');
  if (fail) return '<span class="gh-badge gh-badge-failure">failing</span>';
  if (pending) return '<span class="gh-badge gh-badge-in_progress">pending</span>';
  return '<span class="gh-badge gh-badge-success">passing</span>';
}

function ghReviewBadge(decision) {
  if (!decision) return '';
  if (decision === 'APPROVED') return '<span class="gh-badge gh-badge-approved">approved</span>';
  if (decision === 'CHANGES_REQUESTED') return '<span class="gh-badge gh-badge-changes">changes</span>';
  return '<span class="gh-badge gh-badge-pending">review</span>';
}

function ghSafeColor(raw) {
  if (/^[0-9a-fA-F]{3}$/.test(raw)) return raw[0]+raw[0]+raw[1]+raw[1]+raw[2]+raw[2];
  return /^[0-9a-fA-F]{6}$/.test(raw) ? raw : '666666';
}

function ghLabelHtml(label) {
  const color = ghSafeColor(label.color);
  return `<span class="gh-label" style="color:#${color};background:rgba(${parseInt(color.slice(0,2),16)},${parseInt(color.slice(2,4),16)},${parseInt(color.slice(4,6),16)},0.15)">${escHtml(label.name)}</span>`;
}

function ghStateBadge(state, isDraft) {
  if (isDraft) return '<span class="gh-badge gh-badge-draft">draft</span>';
  const s = (state || '').toUpperCase();
  if (s === 'MERGED') return '<span class="gh-badge gh-badge-merged">merged</span>';
  if (s === 'CLOSED') return '<span class="gh-badge gh-badge-closed">closed</span>';
  return '<span class="gh-badge gh-badge-open">open</span>';
}

// ── Main entry point ────────────────────────────────────────────

export async function refreshGitHub(workDir) {
  const githubBody = document.getElementById('github-body');
  if (ghState.ciInterval) { clearInterval(ghState.ciInterval); ghState.ciInterval = null; }

  if (!ghState.cachedAuth || ghState.cachedAuth.workDir !== workDir) {
    githubBody.innerHTML = '<div class="gh-empty">Checking GitHub authentication...</div>';
    const auth = await window.github.authStatus(workDir);
    ghState.cachedAuth = { ...auth, workDir, ts: Date.now() };
  }
  // Expire cache after 5 minutes
  if (Date.now() - ghState.cachedAuth.ts > 300000) {
    const auth = await window.github.authStatus(ghState.cachedAuth.workDir);
    ghState.cachedAuth = { ...auth, workDir: ghState.cachedAuth.workDir, ts: Date.now() };
  }

  if (!ghState.cachedAuth.authenticated) {
    githubBody.innerHTML = `<div class="gh-auth-msg">
      <svg width="32" height="32" viewBox="0 0 16 16" fill="#666"><path fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
      <div style="color:#999;font-size:0.85rem">GitHub CLI not authenticated</div>
      <div style="color:#666;font-size:0.78rem">Run <code>gh auth login</code> in a terminal to connect your GitHub account.</div>
      <button class="gh-auth-msg-btn" id="gh-auth-open-terminal">Open Terminal</button>
      <button class="gh-auth-msg-btn" id="gh-auth-retry">Retry</button>
    </div>`;
    document.getElementById('gh-auth-open-terminal').addEventListener('click', () => {
      _startTask('__TERMINAL__', tabState.activeWorkDir);
      ghState.cachedAuth = null;
    });
    document.getElementById('gh-auth-retry').addEventListener('click', () => {
      ghState.cachedAuth = null;
      refreshGitHub(workDir);
    });
    return;
  }
  if (!ghState.cachedAuth.isGitHubRepo) {
    githubBody.innerHTML = `<div class="gh-auth-msg">
      <svg width="32" height="32" viewBox="0 0 16 16" fill="#444"><path fill-rule="evenodd" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
      <div style="color:#666;font-size:0.85rem">Not a GitHub repository</div>
    </div>`;
    return;
  }

  let html = `<div class="gh-subnav">
    <button class="gh-subnav-btn${ghState.section === 'prs' ? ' active' : ''}" data-gh-section="prs">PRs</button>
    <button class="gh-subnav-btn${ghState.section === 'issues' ? ' active' : ''}" data-gh-section="issues">Issues</button>
    <button class="gh-subnav-btn${ghState.section === 'ci' ? ' active' : ''}" data-gh-section="ci">CI</button>
    <button class="gh-subnav-btn${ghState.section === 'notifs' ? ' active' : ''}" data-gh-section="notifs">Notifications</button>
  </div><div id="gh-content"></div>`;
  githubBody.innerHTML = html;

  githubBody.querySelector('.gh-subnav').addEventListener('click', (e) => {
    const btn = e.target.closest('.gh-subnav-btn');
    if (!btn) return;
    ghState.section = btn.dataset.ghSection;
    refreshGitHub(tabState.activeWorkDir);
  });

  if (ghState.section === 'prs') refreshGitHubPRs(workDir);
  else if (ghState.section === 'issues') refreshGitHubIssues(workDir);
  else if (ghState.section === 'ci') refreshGitHubCI(workDir);
  else if (ghState.section === 'notifs') refreshGitHubNotifs(workDir);
}

// ── PR list/detail/create ───────────────────────────────────────

async function refreshGitHubPRs(workDir) {
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
      html += `<div class="gh-item" data-gh-pr-number="${pr.number}">
        <span class="gh-item-number">#${pr.number}</span>
        <span class="gh-item-title">${escHtml(pr.title)}</span>
        ${ghStateBadge(pr.state, pr.isDraft)}
        ${ghChecksBadge(pr.statusCheckRollup)}
        ${ghReviewBadge(pr.reviewDecision)}
      </div>`;
    }
  }
  const signal = ghResetListeners();
  content.innerHTML = html;

  content.addEventListener('click', (e) => {
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

async function showGitHubPRDetail(workDir, number) {
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
    html += `<div class="gh-detail-body">${escHtml(pr.body)}</div>`;
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
      html += `<div class="gh-comment"><span class="gh-comment-author">${escHtml((c.author || {}).login || 'unknown')}</span><span class="gh-comment-time">${timeAgo(c.createdAt)}</span><div class="gh-comment-body">${escHtml(c.body)}</div></div>`;
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
  content.innerHTML = html;

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
      if (r.ok) { showGitHubPRDetail(workDir, number); }
      else {
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

// ── Issue list/detail/create ────────────────────────────────────

async function refreshGitHubIssues(workDir) {
  const content = document.getElementById('gh-content');
  content.innerHTML = '<div class="gh-empty">Loading issues...</div>';

  const result = await window.github.issueList(workDir, ghState.issueFilter);
  if (!result.ok) {
    content.innerHTML = `<div class="gh-status-msg error">${escHtml(result.error)}</div>`;
    return;
  }

  let html = `<div class="gh-toolbar">
    <button class="gh-filter-btn${ghState.issueFilter === 'open' ? ' active' : ''}" data-gh-issue-filter="open">Open</button>
    <button class="gh-filter-btn${ghState.issueFilter === 'closed' ? ' active' : ''}" data-gh-issue-filter="closed">Closed</button>
    <button class="gh-filter-btn${ghState.issueFilter === 'all' ? ' active' : ''}" data-gh-issue-filter="all">All</button>
    <button class="gh-action-btn" id="gh-issue-new-btn">+ New Issue</button>
  </div>`;

  if (!result.data.length) {
    html += '<div class="gh-empty">No issues found</div>';
  } else {
    for (const issue of result.data) {
      let labels = '';
      if (issue.labels && issue.labels.length) {
        for (const l of issue.labels) labels += ghLabelHtml(l);
      }
      html += `<div class="gh-item" data-gh-issue-number="${issue.number}">
        <span class="gh-item-number">#${issue.number}</span>
        <span class="gh-item-title">${escHtml(issue.title)}</span>
        ${labels}
        ${ghStateBadge(issue.state)}
      </div>`;
    }
  }
  const signal = ghResetListeners();
  content.innerHTML = html;

  content.addEventListener('click', (e) => {
    const filterBtn = e.target.closest('.gh-filter-btn[data-gh-issue-filter]');
    if (filterBtn) {
      ghState.issueFilter = filterBtn.dataset.ghIssueFilter;
      refreshGitHubIssues(tabState.activeWorkDir);
      return;
    }
    if (e.target.closest('#gh-issue-new-btn')) {
      showGitHubIssueForm(tabState.activeWorkDir);
      return;
    }
    const item = e.target.closest('.gh-item[data-gh-issue-number]');
    if (item) showGitHubIssueDetail(tabState.activeWorkDir, parseInt(item.dataset.ghIssueNumber));
  }, { signal });
}

export async function showGitHubIssueDetail(workDir, number) {
  const content = document.getElementById('gh-content');
  content.innerHTML = '<div class="gh-empty">Loading issue...</div>';

  const [result, todosResult] = await Promise.all([
    window.github.issueView(workDir, number),
    window.todos.list(workDir),
  ]);
  if (!result.ok) {
    content.innerHTML = `<div class="gh-detail"><button class="gh-detail-back">&larr; Back</button><div class="gh-status-msg error">${escHtml(result.error)}</div></div>`;
    content.querySelector('.gh-detail-back').addEventListener('click', () => refreshGitHubIssues(workDir));
    return;
  }

  const issue = result.data;
  let labels = '';
  if (issue.labels && issue.labels.length) {
    for (const l of issue.labels) labels += ghLabelHtml(l);
  }

  let assignees = '';
  if (issue.assignees && issue.assignees.length) {
    assignees = issue.assignees.map(a => escHtml(a.login)).join(', ');
  }

  let html = `<div class="gh-detail">
    <div class="gh-detail-header">
      <button class="gh-detail-back">&larr; Issues</button>
      ${ghStateBadge(issue.state)}
      ${labels}
    </div>
    <div class="gh-detail-title">#${issue.number} ${escHtml(issue.title)}</div>
    <div class="gh-detail-meta">${escHtml((issue.author || {}).login || 'unknown')}${assignees ? ' &middot; assigned: ' + assignees : ''} &middot; ${timeAgo(issue.createdAt)}</div>`;

  if (issue.body) {
    html += `<div class="gh-detail-body">${escHtml(issue.body)}</div>`;
  }

  // Linked Braska todo
  const linkedTodo = (todosResult || []).find(t => t.githubIssue === number);
  html += '<div class="gh-link-section">';
  if (linkedTodo) {
    html += `<div class="gh-link-row">Linked to Braska todo: <a data-gh-goto-todo="${escHtml(linkedTodo.path)}">#${escHtml(linkedTodo.filename.match(/^(\d+)/)?.[1] || '')} ${escHtml(linkedTodo.title)}</a> <button class="gh-btn-cancel" data-gh-unlink="${escHtml(linkedTodo.path)}" style="padding:1px 6px;font-size:0.68rem">Unlink</button></div>`;
  } else {
    const openTodos = (todosResult || []).filter(t => t.status === 'open' && !t.githubIssue);
    if (openTodos.length) {
      html += `<div class="gh-link-row">Link to todo: <select id="gh-link-todo-select"><option value="">Select...</option>`;
      for (const t of openTodos) {
        const num = t.filename.match(/^(\d+)/)?.[1] || '';
        html += `<option value="${escHtml(t.path)}">#${num} ${escHtml(t.title)}</option>`;
      }
      html += `</select> <button class="gh-btn-primary" id="gh-link-todo-btn" style="padding:1px 8px;font-size:0.68rem">Link</button></div>`;
    } else {
      html += '<div class="gh-link-row" style="color:#555">No unlinked open todos to link</div>';
    }
  }
  html += '</div>';

  // Comments
  if (issue.comments && issue.comments.length) {
    html += `<div class="gh-section-title">Comments (${issue.comments.length})</div>`;
    for (const c of issue.comments) {
      html += `<div class="gh-comment"><span class="gh-comment-author">${escHtml((c.author || {}).login || 'unknown')}</span><span class="gh-comment-time">${timeAgo(c.createdAt)}</span><div class="gh-comment-body">${escHtml(c.body)}</div></div>`;
    }
  }

  html += `<div class="gh-comment-form"><textarea placeholder="Add a comment..." id="gh-issue-comment-input"></textarea><button id="gh-issue-comment-submit">Comment</button></div>`;

  if (issue.state === 'OPEN') {
    html += `<div style="margin-top:12px"><button class="gh-btn-danger" id="gh-issue-close-btn">Close Issue</button></div>`;
  }

  html += '</div>';
  content.innerHTML = html;

  content.querySelector('.gh-detail-back').addEventListener('click', () => refreshGitHubIssues(workDir));

  // Link/unlink handlers
  const linkBtn = document.getElementById('gh-link-todo-btn');
  if (linkBtn) {
    linkBtn.addEventListener('click', async () => {
      const sel = document.getElementById('gh-link-todo-select');
      if (!sel.value) return;
      linkBtn.disabled = true;
      await window.github.linkTicket(workDir, sel.value, number);
      showGitHubIssueDetail(workDir, number);
    });
  }
  const unlinkBtn = content.querySelector('[data-gh-unlink]');
  if (unlinkBtn) {
    unlinkBtn.addEventListener('click', async () => {
      unlinkBtn.disabled = true;
      await window.github.unlinkTicket(workDir, unlinkBtn.dataset.ghUnlink);
      showGitHubIssueDetail(workDir, number);
    });
  }
  const gotoTodo = content.querySelector('[data-gh-goto-todo]');
  if (gotoTodo) {
    gotoTodo.addEventListener('click', (e) => {
      e.preventDefault();
      _switchRightPanelTab('todos');
    });
  }

  const commentSubmit = document.getElementById('gh-issue-comment-submit');
  if (commentSubmit) {
    commentSubmit.addEventListener('click', async () => {
      const input = document.getElementById('gh-issue-comment-input');
      const body = input.value.trim();
      if (!body) return;
      commentSubmit.disabled = true;
      commentSubmit.textContent = 'Posting...';
      const r = await window.github.issueComment(workDir, number, body);
      if (r.ok) showGitHubIssueDetail(workDir, number);
      else { commentSubmit.textContent = 'Error'; commentSubmit.disabled = false; }
    });
  }

  const closeBtn = document.getElementById('gh-issue-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', async () => {
      closeBtn.disabled = true;
      closeBtn.textContent = 'Closing...';
      const r = await window.github.issueClose(workDir, number);
      if (r.ok) showGitHubIssueDetail(workDir, number);
      else { closeBtn.textContent = 'Error'; }
    });
  }
}

async function showGitHubIssueForm(workDir) {
  const content = document.getElementById('gh-content');
  content.innerHTML = '<div class="gh-empty">Loading labels...</div>';

  const labelsResult = await window.github.issueLabels(workDir);
  const labels = labelsResult.ok ? labelsResult.data : [];

  let labelsHtml = '';
  if (labels.length) {
    labelsHtml = '<label>Labels</label><div class="gh-labels-picker">';
    for (const l of labels) {
      const color = ghSafeColor(l.color);
      labelsHtml += `<label style="color:#${color}"><input type="checkbox" value="${escHtml(l.name)}" /> ${escHtml(l.name)}</label>`;
    }
    labelsHtml += '</div>';
  }

  content.innerHTML = `<div class="gh-form">
    <button class="gh-detail-back" id="gh-issue-form-cancel-top">&larr; Back to Issues</button>
    <label>Title</label>
    <input id="gh-issue-title" placeholder="Issue title..." />
    <label>Description</label>
    <textarea id="gh-issue-body" placeholder="Describe the issue..."></textarea>
    ${labelsHtml}
    <div class="gh-form-buttons">
      <button class="gh-btn-cancel" id="gh-issue-form-cancel">Cancel</button>
      <button class="gh-btn-primary" id="gh-issue-form-submit">Create Issue</button>
    </div>
    <div id="gh-issue-form-status"></div>
  </div>`;

  const cancel = () => refreshGitHubIssues(workDir);
  document.getElementById('gh-issue-form-cancel').addEventListener('click', cancel);
  document.getElementById('gh-issue-form-cancel-top').addEventListener('click', cancel);

  document.getElementById('gh-issue-form-submit').addEventListener('click', async () => {
    const title = document.getElementById('gh-issue-title').value.trim();
    const body = document.getElementById('gh-issue-body').value.trim();
    const checked = content.querySelectorAll('.gh-labels-picker input:checked');
    const selectedLabels = Array.from(checked).map(c => c.value);
    const status = document.getElementById('gh-issue-form-status');
    const submitBtn = document.getElementById('gh-issue-form-submit');
    if (!title) { status.className = 'gh-status-msg error'; status.textContent = 'Title is required'; return; }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating...';
    const r = await window.github.issueCreate(workDir, title, body, selectedLabels);
    if (r.ok) {
      status.className = 'gh-status-msg success';
      status.textContent = 'Issue created: ' + r.url;
      setTimeout(() => { ghState.issueFilter = 'open'; refreshGitHubIssues(workDir); }, 1500);
    } else {
      status.className = 'gh-status-msg error';
      status.textContent = r.error;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Issue';
    }
  });
}

// ── CI section ──────────────────────────────────────────────────

async function refreshGitHubCI(workDir) {
  const content = document.getElementById('gh-content');
  content.innerHTML = '<div class="gh-empty">Loading CI runs...</div>';

  const branch = await window.gitDiff.currentBranch(workDir);
  const result = await window.github.runList(workDir, branch);
  if (!result.ok) {
    content.innerHTML = `<div class="gh-status-msg error">${escHtml(result.error)}</div>`;
    return;
  }

  let html = `<div class="gh-toolbar"><span style="color:#888;font-size:0.75rem">Branch: ${escHtml(branch || 'unknown')}</span><button class="gh-action-btn" id="gh-ci-refresh-btn">Refresh</button></div>`;

  if (!result.data.length) {
    html += '<div class="gh-empty">No workflow runs found</div>';
  } else {
    for (const run of result.data) {
      const statusCls = run.conclusion === 'success' ? 'success' : run.conclusion === 'failure' ? 'failure' : run.status === 'in_progress' ? 'in_progress' : 'pending';
      const icon = run.conclusion === 'success' ? '<span style="color:#3fb950">&#10003;</span>' :
                   run.conclusion === 'failure' ? '<span style="color:#f85149">&#10007;</span>' :
                   '<span style="color:#d29922">&#9679;</span>';
      html += `<div class="gh-ci-item" data-gh-run-id="${run.databaseId}">
        ${icon}
        <span class="gh-ci-title">${escHtml(run.displayTitle)}</span>
        <span class="gh-badge gh-badge-${statusCls}">${escHtml(run.conclusion || run.status || 'pending')}</span>
        <span class="gh-ci-time">${timeAgo(run.createdAt)}</span>
      </div>`;
    }
  }
  const signal = ghResetListeners();
  content.innerHTML = html;

  content.addEventListener('click', (e) => {
    if (e.target.closest('#gh-ci-refresh-btn')) {
      refreshGitHubCI(tabState.activeWorkDir);
      return;
    }
    const item = e.target.closest('.gh-ci-item[data-gh-run-id]');
    if (item) showGitHubRunDetail(tabState.activeWorkDir, parseInt(item.dataset.ghRunId));
  }, { signal });

  // Auto-refresh every 30s (skip when page is hidden)
  if (ghState.ciInterval) clearInterval(ghState.ciInterval);
  ghState.ciInterval = setInterval(() => {
    if (document.hidden) return;
    const activePanel = document.querySelector('.filetree-tab.active')?.dataset.panel;
    if (activePanel === 'github' && ghState.section === 'ci' && tabState.activeWorkDir) {
      refreshGitHubCI(tabState.activeWorkDir);
    } else {
      clearInterval(ghState.ciInterval);
      ghState.ciInterval = null;
    }
  }, 30000);
}

async function showGitHubRunDetail(workDir, runId) {
  const content = document.getElementById('gh-content');
  content.innerHTML = '<div class="gh-empty">Loading run details...</div>';

  const result = await window.github.runView(workDir, runId);
  if (!result.ok) {
    content.innerHTML = `<div class="gh-detail"><button class="gh-detail-back">&larr; Back</button><div class="gh-status-msg error">${escHtml(result.error)}</div></div>`;
    content.querySelector('.gh-detail-back').addEventListener('click', () => refreshGitHubCI(workDir));
    return;
  }

  const run = result.data;
  let html = `<div class="gh-detail">
    <div class="gh-detail-header"><button class="gh-detail-back">&larr; CI Runs</button></div>
    <div class="gh-detail-title">${escHtml(run.displayTitle)}</div>
    <div class="gh-detail-meta">Status: ${escHtml(run.conclusion || run.status || 'pending')}</div>`;

  if (run.jobs && run.jobs.length) {
    html += '<div class="gh-section-title">Jobs</div>';
    for (const job of run.jobs) {
      const icon = job.conclusion === 'success' ? '<span style="color:#3fb950">&#10003;</span>' :
                   job.conclusion === 'failure' ? '<span style="color:#f85149">&#10007;</span>' :
                   '<span style="color:#d29922">&#9679;</span>';
      html += `<div class="gh-checks-item">${icon} <span>${escHtml(job.name)}</span> <span class="gh-badge gh-badge-${job.conclusion === 'success' ? 'success' : job.conclusion === 'failure' ? 'failure' : 'pending'}">${escHtml(job.conclusion || job.status || 'pending')}</span></div>`;
      if (job.steps && job.steps.length) {
        for (const step of job.steps) {
          const sIcon = step.conclusion === 'success' ? '<span style="color:#3fb950;font-size:0.6rem">&#10003;</span>' :
                        step.conclusion === 'failure' ? '<span style="color:#f85149;font-size:0.6rem">&#10007;</span>' :
                        step.conclusion === 'skipped' ? '<span style="color:#555;font-size:0.6rem">&#8722;</span>' :
                        '<span style="color:#d29922;font-size:0.6rem">&#9679;</span>';
          html += `<div class="gh-checks-item" style="padding-left:16px;font-size:0.72rem">${sIcon} ${escHtml(step.name)}</div>`;
        }
      }
    }
  }
  html += '</div>';
  content.innerHTML = html;
  content.querySelector('.gh-detail-back').addEventListener('click', () => refreshGitHubCI(workDir));
}

// ── Notifications section ───────────────────────────────────────

async function refreshGitHubNotifs(workDir) {
  const content = document.getElementById('gh-content');
  content.innerHTML = '<div class="gh-empty">Loading notifications...</div>';

  const result = await window.github.notifications(workDir);
  if (!result.ok) {
    content.innerHTML = `<div class="gh-status-msg error">${escHtml(result.error)}</div>`;
    return;
  }

  let html = `<div class="gh-toolbar"><span style="color:#888;font-size:0.75rem">GitHub Notifications</span><button class="gh-action-btn" id="gh-notif-refresh-btn">Refresh</button></div>`;

  if (!result.data || !result.data.length) {
    html += '<div class="gh-empty">No notifications</div>';
  } else {
    for (const n of result.data) {
      const subject = n.subject || {};
      const typeIcon = subject.type === 'PullRequest' ? '<span style="color:#a371f7">PR</span>' :
                       subject.type === 'Issue' ? '<span style="color:#3fb950">I</span>' :
                       '<span style="color:#888">N</span>';
      html += `<div class="gh-notif-item">
        ${typeIcon}
        <span class="gh-notif-title">${escHtml(subject.title || 'Notification')}</span>
        <span class="gh-notif-reason">${escHtml(n.reason || '')}</span>
        <span class="gh-notif-time">${timeAgo(n.updated_at)}</span>
      </div>`;
    }
  }
  const signal = ghResetListeners();
  content.innerHTML = html;

  content.addEventListener('click', (e) => {
    if (e.target.closest('#gh-notif-refresh-btn')) {
      refreshGitHubNotifs(tabState.activeWorkDir);
    }
  }, { signal });
}
