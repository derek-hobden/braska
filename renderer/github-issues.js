// ── GitHub Issues — list, detail, create form ──

import { tabState, ghState } from './state.js';
import { escHtml, timeAgo } from './utils.js';
import { ghResetListeners, ghLabelHtml, ghStateBadge } from './github-panel.js';

// ── Injected dep ───────────────────────────────────────────────
let _switchRightPanelTab = null;

export function initGitHubIssues({ switchRightPanelTab }) {
  _switchRightPanelTab = switchRightPanelTab;
}

// ── Issue list ─────────────────────────────────────────────────

export async function refreshGitHubIssues(workDir) {
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

// ── Issue detail ───────────────────────────────────────────────

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

// ── Issue create form ──────────────────────────────────────────

function ghSafeColor(raw) {
  if (/^[0-9a-fA-F]{3}$/.test(raw)) return raw[0]+raw[0]+raw[1]+raw[1]+raw[2]+raw[2];
  return /^[0-9a-fA-F]{6}$/.test(raw) ? raw : '666666';
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
