// ── GitHub panel module ─────────────────────────────────────────
// Core: helpers, auth flow, section routing, CI, notifications.
// PRs and issues are in github-prs.js and github-issues.js.

import { tabState, ghState } from './state.js';
import { escHtml, timeAgo } from './utils.js';
import { refreshGitHubPRs } from './github-prs.js';
import { refreshGitHubIssues, showGitHubIssueDetail, initGitHubIssues } from './github-issues.js';
import { clearGitHubBadgeForWorkDir } from './sidebar.js';

// ── Cross-module deps injected via init ─────────────────────────
let _startTask = null;

export function initGitHubPanel({ startTask, switchRightPanelTab, loadProjects, openWorkDir }) {
  _startTask = startTask;
  initGitHubIssues({ switchRightPanelTab, loadProjects, openWorkDir });
}

// ── Shared helpers (exported for github-prs.js / github-issues.js) ──

export function ghResetListeners() {
  if (ghState.contentAC) ghState.contentAC.abort();
  ghState.contentAC = new AbortController();
  return ghState.contentAC.signal;
}

export function ghChecksBadge(rollup) {
  if (!rollup || !rollup.length) return '';
  const fail = rollup.some(c => c.conclusion === 'FAILURE' || c.conclusion === 'ERROR');
  const pending = rollup.some(c => !c.conclusion || c.state === 'PENDING' || c.state === 'QUEUED' || c.state === 'IN_PROGRESS');
  if (fail) return '<span class="gh-badge gh-badge-failure">failing</span>';
  if (pending) return '<span class="gh-badge gh-badge-in_progress">pending</span>';
  return '<span class="gh-badge gh-badge-success">passing</span>';
}

export function ghReviewBadge(decision) {
  if (!decision) return '';
  if (decision === 'APPROVED') return '<span class="gh-badge gh-badge-approved">approved</span>';
  if (decision === 'CHANGES_REQUESTED') return '<span class="gh-badge gh-badge-changes">changes</span>';
  return '<span class="gh-badge gh-badge-pending">review</span>';
}

function ghSafeColor(raw) {
  if (/^[0-9a-fA-F]{3}$/.test(raw)) return raw[0]+raw[0]+raw[1]+raw[1]+raw[2]+raw[2];
  return /^[0-9a-fA-F]{6}$/.test(raw) ? raw : '666666';
}

export function ghLabelHtml(label) {
  const color = ghSafeColor(label.color);
  return `<span class="gh-label" style="color:#${color};background:rgba(${parseInt(color.slice(0,2),16)},${parseInt(color.slice(2,4),16)},${parseInt(color.slice(4,6),16)},0.15)">${escHtml(label.name)}</span>`;
}

export function ghStateBadge(state, isDraft) {
  if (isDraft) return '<span class="gh-badge gh-badge-draft">draft</span>';
  const s = (state || '').toUpperCase();
  if (s === 'MERGED') return '<span class="gh-badge gh-badge-merged">merged</span>';
  if (s === 'CLOSED') return '<span class="gh-badge gh-badge-closed">closed</span>';
  return '<span class="gh-badge gh-badge-open">open</span>';
}

// ── Activity badge — sidebar GitHub link badge handles this now ──
function updateActivityBadge() {
  // Activity is tracked via ghState.hasActivity; sidebar badges update via refreshProjectBadges
}

// ── Main entry point ────────────────────────────────────────────

export async function refreshGitHub(workDir) {
  const ghBody = document.getElementById('gh-inline-section');
  if (ghState.ciInterval) { clearInterval(ghState.ciInterval); ghState.ciInterval = null; }

  if (!ghState.cachedAuth || ghState.cachedAuth.workDir !== workDir) {
    ghBody.innerHTML = '<div class="gh-empty">Checking GitHub authentication...</div>';
    const auth = await window.github.authStatus(workDir);
    ghState.cachedAuth = { ...auth, workDir, ts: Date.now() };
  }
  // Expire cache after 5 minutes
  if (Date.now() - ghState.cachedAuth.ts > 300000) {
    const auth = await window.github.authStatus(ghState.cachedAuth.workDir);
    ghState.cachedAuth = { ...auth, workDir: ghState.cachedAuth.workDir, ts: Date.now() };
  }

  if (!ghState.cachedAuth.authenticated) {
    // Clear any pending direct-jump sentinel — we're showing the auth prompt,
    // not the issue, and the sentinel would silently fire on the next Issues
    // load (potentially long after the user has navigated elsewhere).
    ghState.directIssueNumber = null;
    ghState.directPRNumber = null;
    ghBody.innerHTML = `<div class="gh-auth-msg">
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
    ghState.directIssueNumber = null;
    ghState.directPRNumber = null;
    ghBody.innerHTML = `<div class="gh-auth-msg">
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
  ghBody.innerHTML = html;

  ghBody.querySelector('.gh-subnav').addEventListener('click', (e) => {
    const btn = e.target.closest('.gh-subnav-btn');
    if (!btn) return;
    // Explicit user nav cancels any pending direct-jump sentinels.
    ghState.directIssueNumber = null;
    ghState.directPRNumber = null;
    ghState.section = btn.dataset.ghSection;
    refreshGitHub(tabState.activeWorkDir);
  });

  if (ghState.section === 'prs') refreshGitHubPRs(workDir);
  else if (ghState.section === 'issues') refreshGitHubIssues(workDir);
  else if (ghState.section === 'ci') refreshGitHubCI(workDir);
  else if (ghState.section === 'notifs') refreshGitHubNotifs(workDir);
}

// Re-export for app.js
export { showGitHubIssueDetail };

// ── CI section ──────────────────────────────────────────────────

// Stringified fingerprint of the last-rendered CI run set. Auto-refresh skips
// the innerHTML rebuild when this is unchanged. gh issue #30.
let ciLastFingerprint = null;

function ciFingerprint(branch, runs) {
  return branch + '|' + runs.map(r => `${r.databaseId}:${r.status}:${r.conclusion}`).join(',');
}

async function refreshGitHubCI(workDir, opts = {}) {
  const content = document.getElementById('gh-content');
  if (!opts.silent) content.innerHTML = '<div class="gh-empty">Loading CI runs...</div>';

  const branch = await window.gitDiff.currentBranch(workDir);
  const result = await window.github.runList(workDir, branch);
  if (!result.ok) {
    content.innerHTML = `<div class="gh-status-msg error">${escHtml(result.error)}</div>`;
    ciLastFingerprint = null;
    return;
  }

  const fingerprint = ciFingerprint(branch, result.data);
  if (opts.silent && fingerprint === ciLastFingerprint) return; // nothing changed
  ciLastFingerprint = fingerprint;

  let html = `<div class="gh-toolbar"><span style="color:#888;font-size:0.75rem">Branch: ${escHtml(branch || 'unknown')}</span><button class="gh-action-btn" id="gh-ci-refresh-btn">Refresh</button></div>`;

  // Set activity badge if any run failed (only when not currently viewing GitHub)
  const hasCIFailure = result.data.some(r => r.conclusion === 'failure' || r.conclusion === 'error');
  if (hasCIFailure && !ghState.viewActive) {
    ghState.hasActivity = true;
    updateActivityBadge();
  }

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
    if (ghState.viewActive && ghState.section === 'ci' && tabState.activeWorkDir) {
      refreshGitHubCI(tabState.activeWorkDir, { silent: true });
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

  const hasNotifs = result.data && result.data.length > 0;
  const markReadBtn = hasNotifs ? `<button class="gh-action-btn" id="gh-notif-mark-read-btn">Mark all read</button>` : '';
  let html = `<div class="gh-toolbar"><span style="color:#888;font-size:0.75rem">GitHub Notifications</span>${markReadBtn}<button class="gh-action-btn" id="gh-notif-refresh-btn">Refresh</button></div>`;

  // Set activity badge if there are notifications (only when not currently viewing GitHub)
  if (result.data?.length && !ghState.viewActive) {
    ghState.hasActivity = true;
    updateActivityBadge();
  }

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

  content.addEventListener('click', async (e) => {
    if (e.target.closest('#gh-notif-refresh-btn')) {
      refreshGitHubNotifs(tabState.activeWorkDir);
      return;
    }
    const markBtn = e.target.closest('#gh-notif-mark-read-btn');
    if (markBtn) {
      markBtn.disabled = true;
      markBtn.textContent = 'Marking...';
      const workDir = tabState.activeWorkDir;
      const res = await window.github.notificationsMarkRead(workDir);
      if (res.ok) {
        ghState.hasActivity = false;
        updateActivityBadge();
        clearGitHubBadgeForWorkDir(workDir);
        // Optimistic UI: gh CLI's --cache 60s on the GET means a refetch
        // would return the same stale unread list. Replace with empty state.
        content.querySelectorAll('.gh-notif-item').forEach(el => el.remove());
        markBtn.remove();
        if (!content.querySelector('.gh-empty')) {
          const empty = document.createElement('div');
          empty.className = 'gh-empty';
          empty.textContent = 'No notifications';
          content.appendChild(empty);
        }
      } else {
        markBtn.disabled = false;
        markBtn.textContent = 'Mark all read';
        const toolbar = content.querySelector('.gh-toolbar');
        if (toolbar) {
          const errEl = document.createElement('span');
          errEl.style.cssText = 'color:#f85149;font-size:0.7rem;margin-left:0.5rem';
          errEl.textContent = res.error || 'Failed';
          toolbar.appendChild(errEl);
        }
      }
    }
  }, { signal });
}
