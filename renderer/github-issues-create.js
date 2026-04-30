// ── GitHub Issues — create form ──

import { ghState } from './state.js';
import { escHtml, ghSafeColor } from './utils.js';

// `refreshList` is passed in by the caller to avoid a circular import with
// github-issues.js (which owns refreshGitHubIssues).
export async function showGitHubIssueForm(workDir, refreshList) {
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

  const cancel = () => refreshList(workDir);
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
      setTimeout(() => { ghState.issueFilter = 'open'; refreshList(workDir); }, 1500);
    } else {
      status.className = 'gh-status-msg error';
      status.textContent = r.error;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Issue';
    }
  });
}
