// ── GitHub Issues — list, detail, create + edit forms ──

import { tabState, ghState } from './state.js';
import { escHtml, timeAgo, ghSafeColor } from './utils.js';
import { ghResetListeners, ghLabelHtml, ghStateBadge } from './github-panel.js';
import { showGitHubIssueForm } from './github-issues-create.js';

// ── Injected dep ───────────────────────────────────────────────
let _switchRightPanelTab = null;

// In-progress edit for a single issue. Keyed by issueNumber so refreshes
// targeting the same issue re-enter edit mode rather than dropping the draft.
let editDraft = null;

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
      showGitHubIssueForm(tabState.activeWorkDir, refreshGitHubIssues);
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
    window.todo.list(workDir),
  ]);
  if (!result.ok) {
    content.innerHTML = `<div class="gh-detail"><button class="gh-detail-back">&larr; Back</button><div class="gh-status-msg error">${escHtml(result.error)}</div></div>`;
    content.querySelector('.gh-detail-back').addEventListener('click', () => refreshGitHubIssues(workDir));
    return;
  }

  const issue = result.data;
  const isEditing = editDraft && editDraft.issueNumber === issue.number;
  if (isEditing) {
    // Refresh draft's "originalLabels" reference to current server state so
    // diff-on-save uses up-to-date data. Local edits are preserved.
    editDraft.originalLabels = (issue.labels || []).map(l => l.name);
    editDraft.originalTitle = issue.title;
    editDraft.originalBody = issue.body || '';
  }

  let assignees = '';
  if (issue.assignees && issue.assignees.length) {
    assignees = issue.assignees.map(a => escHtml(a.login)).join(', ');
  }

  let html = `<div class="gh-detail">
    <div class="gh-detail-header">
      <button class="gh-detail-back">&larr; Issues</button>
      ${ghStateBadge(issue.state)}
      <div class="gh-edit-labels-region" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">${renderLabelsRegion(issue, isEditing)}</div>
    </div>`;

  if (isEditing) {
    html += `<input class="gh-edit-title-input" id="gh-issue-edit-title" value="${escHtml(editDraft.title)}" />`;
  } else {
    html += `<div class="gh-detail-title">#${issue.number} ${escHtml(issue.title)}</div>`;
  }
  html += `<div class="gh-detail-meta">${escHtml((issue.author || {}).login || 'unknown')}${assignees ? ' &middot; assigned: ' + assignees : ''} &middot; ${timeAgo(issue.createdAt)}</div>`;

  if (isEditing) {
    html += `<textarea class="gh-edit-body-input" id="gh-issue-edit-body" placeholder="Issue description...">${escHtml(editDraft.body)}</textarea>`;
  } else if (issue.body) {
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

  html += '<div class="gh-issue-actions" style="margin-top:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">';
  if (isEditing) {
    html += `<button class="gh-btn-primary" id="gh-issue-save-btn">Save</button>
             <button class="gh-btn-cancel" id="gh-issue-cancel-edit-btn">Cancel</button>
             <span id="gh-issue-edit-status"></span>`;
  } else {
    html += `<button class="gh-action-btn" id="gh-issue-edit-btn">Edit</button>`;
    if (issue.state === 'OPEN') {
      html += `<button class="gh-btn-danger" id="gh-issue-close-btn">Close Issue</button>`;
    } else {
      html += `<button class="gh-btn-primary" id="gh-issue-reopen-btn">Reopen Issue</button>`;
    }
  }
  html += '</div>';

  html += '</div>';
  content.innerHTML = html;

  content.querySelector('.gh-detail-back').addEventListener('click', () => {
    editDraft = null;
    refreshGitHubIssues(workDir);
  });

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
      _switchRightPanelTab('todo');
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

  const reopenBtn = document.getElementById('gh-issue-reopen-btn');
  if (reopenBtn) {
    reopenBtn.addEventListener('click', async () => {
      reopenBtn.disabled = true;
      reopenBtn.textContent = 'Reopening...';
      const r = await window.github.issueReopen(workDir, number);
      if (r.ok) showGitHubIssueDetail(workDir, number);
      else { reopenBtn.textContent = 'Error'; }
    });
  }

  const editBtn = document.getElementById('gh-issue-edit-btn');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      editDraft = {
        issueNumber: issue.number,
        title: issue.title,
        body: issue.body || '',
        labels: (issue.labels || []).map(l => l.name),
        labelObjects: (issue.labels || []).slice(),
        originalTitle: issue.title,
        originalBody: issue.body || '',
        originalLabels: (issue.labels || []).map(l => l.name),
      };
      showGitHubIssueDetail(workDir, number);
    });
  }

  if (isEditing) {
    const titleInput = document.getElementById('gh-issue-edit-title');
    if (titleInput) titleInput.addEventListener('input', () => { editDraft.title = titleInput.value; });
    const bodyInput = document.getElementById('gh-issue-edit-body');
    if (bodyInput) bodyInput.addEventListener('input', () => { editDraft.body = bodyInput.value; });

    wireEditLabelHandlers(workDir, issue);

    const cancelBtn = document.getElementById('gh-issue-cancel-edit-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', () => {
      editDraft = null;
      showGitHubIssueDetail(workDir, number);
    });

    const saveBtn = document.getElementById('gh-issue-save-btn');
    if (saveBtn) saveBtn.addEventListener('click', () => saveIssueEdit(workDir, issue));
  }
}

// ── Labels region (read + edit modes) ──────────────────────────

function renderLabelsRegion(issue, isEditing) {
  let html = '';
  if (isEditing) {
    // Render each draft label as a chip with an × remove control. Use the
    // colour from the original issue label list when available; fall back
    // to a neutral colour for labels just added from the picker.
    for (const name of editDraft.labels) {
      const found = (editDraft.labelObjects || []).find(l => l.name === name);
      const color = ghSafeColor((found && found.color) || '666666');
      html += `<span class="gh-label-chip-edit" style="border-color:#${color};color:#${color}">${escHtml(name)}<button class="gh-label-chip-remove" data-gh-label-remove="${escHtml(name)}" title="Remove label">&times;</button></span>`;
    }
    html += `<button class="gh-action-btn gh-add-label-btn" id="gh-issue-add-label-btn">+ Add label</button>`;
    html += `<span class="gh-label-picker-anchor" id="gh-issue-label-picker"></span>`;
  } else if (issue.labels && issue.labels.length) {
    for (const l of issue.labels) html += ghLabelHtml(l);
  }
  return html;
}

function wireEditLabelHandlers(workDir, issue) {
  const region = document.querySelector('.gh-edit-labels-region');
  if (!region) return;

  region.addEventListener('click', async (e) => {
    const removeBtn = e.target.closest('[data-gh-label-remove]');
    if (removeBtn) {
      const name = removeBtn.dataset.ghLabelRemove;
      editDraft.labels = editDraft.labels.filter(l => l !== name);
      region.innerHTML = renderLabelsRegion(issue, true);
      return;
    }
    if (e.target.closest('#gh-issue-add-label-btn')) {
      await openLabelPicker(workDir, issue);
      return;
    }
    const pickItem = e.target.closest('[data-gh-label-pick]');
    if (pickItem) {
      const name = pickItem.dataset.ghLabelPick;
      if (!editDraft.labels.includes(name)) editDraft.labels.push(name);
      // Track colour for chips of newly-added labels.
      const color = pickItem.dataset.ghLabelColor || '666666';
      if (!(editDraft.labelObjects || []).find(l => l.name === name)) {
        editDraft.labelObjects = (editDraft.labelObjects || []).concat([{ name, color }]);
      }
      region.innerHTML = renderLabelsRegion(issue, true);
      return;
    }
  });
}

async function openLabelPicker(workDir, issue) {
  const anchor = document.getElementById('gh-issue-label-picker');
  if (!anchor) return;
  if (anchor.querySelector('.gh-label-picker')) { anchor.innerHTML = ''; return; }
  anchor.innerHTML = '<span class="gh-label-picker"><span style="color:#777">Loading...</span></span>';
  const r = await window.github.issueLabels(workDir);
  if (!r.ok) { anchor.innerHTML = `<span class="gh-status-msg error">${escHtml(r.error)}</span>`; return; }
  const available = r.data.filter(l => !editDraft.labels.includes(l.name));
  if (!available.length) { anchor.innerHTML = '<span style="color:#777;font-size:0.7rem">All labels added</span>'; return; }
  let html = '<span class="gh-label-picker">';
  for (const l of available) {
    const color = ghSafeColor(l.color);
    html += `<button class="gh-label-pick-item" data-gh-label-pick="${escHtml(l.name)}" data-gh-label-color="${color}" style="border-color:#${color};color:#${color}">${escHtml(l.name)}</button>`;
  }
  html += '</span>';
  anchor.innerHTML = html;
}

async function saveIssueEdit(workDir, originalIssue) {
  const status = document.getElementById('gh-issue-edit-status');
  const saveBtn = document.getElementById('gh-issue-save-btn');
  const draft = editDraft;
  const title = draft.title.trim();
  if (!title) {
    if (status) { status.className = 'gh-status-msg error'; status.textContent = 'Title is required'; }
    return;
  }
  const changes = {};
  if (title !== draft.originalTitle) changes.title = title;
  if (draft.body !== draft.originalBody) changes.body = draft.body;
  const orig = draft.originalLabels;
  const cur = draft.labels;
  const addLabels = cur.filter(l => !orig.includes(l));
  const removeLabels = orig.filter(l => !cur.includes(l));
  if (addLabels.length) changes.addLabels = addLabels;
  if (removeLabels.length) changes.removeLabels = removeLabels;

  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }
  if (status) { status.className = ''; status.textContent = ''; }
  const r = await window.github.issueEdit(workDir, originalIssue.number, changes);
  if (r.ok) {
    editDraft = null;
    showGitHubIssueDetail(workDir, originalIssue.number);
  } else {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
    if (status) { status.className = 'gh-status-msg error'; status.textContent = r.error; }
  }
}

