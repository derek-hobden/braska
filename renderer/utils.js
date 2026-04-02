// ── Pure utility functions & constants for the Braska renderer ──
// These have no side-effects, no DOM access, and no global-state references.
// Every export is either a function or a constant.

// ── SVG icon constants ──────────────────────────────────────────

export const SVG_OCTOCAT = '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>';

export const SVG_GIT_LOGO = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.546 10.93L13.067.452a1.55 1.55 0 0 0-2.188 0L8.708 2.627l2.76 2.76a1.838 1.838 0 0 1 2.327 2.341l2.66 2.66a1.838 1.838 0 1 1-1.103 1.03l-2.48-2.48v6.53a1.838 1.838 0 1 1-1.512-.065V8.78a1.838 1.838 0 0 1-.998-2.41L7.629 3.64.452 10.818a1.55 1.55 0 0 0 0 2.188l10.48 10.48a1.55 1.55 0 0 0 2.186 0l10.428-10.43a1.55 1.55 0 0 0 0-2.127z"/></svg>';

export const SVG_GIT_BRANCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>';

export const SVG_FOLDER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';

export const SVG_FILE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>';

export const SVG_CODE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>';

export const SVG_BRACES = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1"/><path d="M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1"/></svg>';

export const SVG_HASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>';

export const SVG_IMAGE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';

export const SVG_STYLE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>';

export const SVG_TEXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>';

// ── File icon map ───────────────────────────────────────────────

export const FILE_ICON_MAP = {
  js:   { svg: SVG_CODE, color: '#e8d44d' },
  mjs:  { svg: SVG_CODE, color: '#e8d44d' },
  cjs:  { svg: SVG_CODE, color: '#e8d44d' },
  jsx:  { svg: SVG_CODE, color: '#61dafb' },
  ts:   { svg: SVG_CODE, color: '#3178c6' },
  tsx:  { svg: SVG_CODE, color: '#3178c6' },
  mts:  { svg: SVG_CODE, color: '#3178c6' },
  cts:  { svg: SVG_CODE, color: '#3178c6' },
  json: { svg: SVG_BRACES, color: '#e8d44d' },
  html: { svg: SVG_CODE, color: '#e44d26' },
  htm:  { svg: SVG_CODE, color: '#e44d26' },
  css:  { svg: SVG_STYLE, color: '#a86fd9' },
  scss: { svg: SVG_STYLE, color: '#cf649a' },
  less: { svg: SVG_STYLE, color: '#a86fd9' },
  md:   { svg: SVG_TEXT, color: '#6fadcf' },
  py:   { svg: SVG_CODE, color: '#3fb950' },
  go:   { svg: SVG_CODE, color: '#00add8' },
  rs:   { svg: SVG_CODE, color: '#dea584' },
  svg:  { svg: SVG_IMAGE, color: '#cf649a' },
  png:  { svg: SVG_IMAGE, color: '#cf649a' },
  jpg:  { svg: SVG_IMAGE, color: '#cf649a' },
  jpeg: { svg: SVG_IMAGE, color: '#cf649a' },
  gif:  { svg: SVG_IMAGE, color: '#cf649a' },
  ico:  { svg: SVG_IMAGE, color: '#cf649a' },
  yaml: { svg: SVG_BRACES, color: '#cb171e' },
  yml:  { svg: SVG_BRACES, color: '#cb171e' },
  toml: { svg: SVG_BRACES, color: '#9c4221' },
  sh:   { svg: SVG_HASH, color: '#3fb950' },
  bash: { svg: SVG_HASH, color: '#3fb950' },
  zsh:  { svg: SVG_HASH, color: '#3fb950' },
};

// ── Pure utility functions ──────────────────────────────────────

/** Strip ANSI escape codes and control characters from a string. */
export function stripAnsi(str) {
  return str.replace(/\x1b\[[\x30-\x3f]*[\x20-\x2f]*[\x40-\x7e]/g, '').replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '').replace(/\x1b[\x20-\x7e]/g, '').replace(/[\x00-\x1f\x7f]/g, '');
}

/** Format a timestamp (ms) as a relative time string (e.g. "5s", "3m", "2h"). */
export function formatTimeAgo(ts) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return 'now';
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

/** Escape HTML entities in a string. */
export function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Convert a specialist name (e.g. '__CLAUDE__', 'code-reviewer') to a display name. */
export function specialistDisplayName(name) {
  if (name === '__CLAUDE__') return 'Claude';
  if (name === '__TERMINAL__') return 'Terminal';
  return name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/** Format a date string as relative time (e.g. "just now", "3m ago", "2d ago"). */
export function timeAgo(dateStr) {
  const s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (isNaN(s)) return 'unknown';
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

/** Return HTML for +/- stat badges. */
export function statSpan(added, deleted) {
  return `<span class="changes-added">+${added}</span> <span class="changes-deleted">&minus;${deleted}</span>`;
}

/** Return { svg, color } for a filename based on its extension. */
export function fileIcon(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const entry = FILE_ICON_MAP[ext];
  if (entry) return { svg: entry.svg, color: entry.color };
  return { svg: SVG_FILE, color: '#888' };
}

/** Parse unified diff text into structured hunks with line metadata. */
export function parseDiffOutput(text) {
  const lines = text.split('\n');
  const hunks = [];
  let current = null;
  let totalAdded = 0, totalDeleted = 0;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/);
      if (m) {
        current = { header: line, oldStart: +m[1], newStart: +m[2], lines: [] };
        hunks.push(current);
      }
    } else if (current) {
      if (line.startsWith('+')) {
        current.lines.push({ type: 'added', text: line.slice(1) });
        totalAdded++;
      } else if (line.startsWith('-')) {
        current.lines.push({ type: 'deleted', text: line.slice(1) });
        totalDeleted++;
      } else if (line.startsWith(' ') || line === '') {
        current.lines.push({ type: 'context', text: line.slice(1) });
      }
    }
  }
  return { hunks, totalAdded, totalDeleted };
}

/** Render parsed diff hunks into side-by-side HTML. */
export function renderDiffContent(parsed) {
  let html = '';
  for (const hunk of parsed.hunks) {
    html += `<div class="diff-hunk-header">${escHtml(hunk.header)}</div>`;
    let oldLine = hunk.oldStart, newLine = hunk.newStart;
    let i = 0;
    while (i < hunk.lines.length) {
      const ln = hunk.lines[i];
      if (ln.type === 'context') {
        html += sbsRow(oldLine++, escHtml(ln.text), 'context', newLine++, escHtml(ln.text), 'context');
        i++;
      } else {
        const del = [], add = [];
        while (i < hunk.lines.length && hunk.lines[i].type === 'deleted') { del.push(hunk.lines[i].text); i++; }
        while (i < hunk.lines.length && hunk.lines[i].type === 'added') { add.push(hunk.lines[i].text); i++; }
        const max = Math.max(del.length, add.length);
        for (let j = 0; j < max; j++) {
          const hasOld = j < del.length, hasNew = j < add.length;
          if (hasOld && hasNew) {
            const [oh, nh] = wordDiff(del[j], add[j]);
            html += sbsRow(oldLine++, oh, 'deleted', newLine++, nh, 'added');
          } else {
            html += sbsRow(
              hasOld ? oldLine++ : '', hasOld ? escHtml(del[j]) : '', hasOld ? 'deleted' : 'empty',
              hasNew ? newLine++ : '', hasNew ? escHtml(add[j]) : '', hasNew ? 'added' : 'empty'
            );
          }
        }
      }
    }
  }
  return html;
}

/** Build a single side-by-side diff row. */
export function sbsRow(oN, oH, oT, nN, nH, nT) {
  return `<div class="diff-sbs-row"><div class="diff-sbs-cell ${oT}"><span class="diff-line-num">${oN}</span><span class="diff-line-content">${oH}</span></div><div class="diff-sbs-cell ${nT}"><span class="diff-line-num">${nN}</span><span class="diff-line-content">${nH}</span></div></div>`;
}

/** Compute word-level diff between two strings, returning [oldHtml, newHtml]. */
export function wordDiff(oldText, newText) {
  const ot = oldText.match(/\S+|\s+/g) || [];
  const nt = newText.match(/\S+|\s+/g) || [];
  const m = ot.length, n = nt.length;
  const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = ot[i-1] === nt[j-1] ? dp[i-1][j-1] + 1 : Math.max(dp[i-1][j], dp[i][j-1]);
  const oF = new Array(m).fill(false), nF = new Array(n).fill(false);
  let ii = m, jj = n;
  while (ii > 0 && jj > 0) {
    if (ot[ii-1] === nt[jj-1]) { oF[--ii] = true; nF[--jj] = true; }
    else if (dp[ii-1][jj] >= dp[ii][jj-1]) ii--;
    else jj--;
  }
  let oh = '', nh = '';
  for (let i = 0; i < m; i++) { const t = escHtml(ot[i]); oh += oF[i] ? t : `<span class="diff-word-del">${t}</span>`; }
  for (let i = 0; i < n; i++) { const t = escHtml(nt[i]); nh += nF[i] ? t : `<span class="diff-word-add">${t}</span>`; }
  return [oh, nh];
}

/** Build the HTML for a single change-entry row in the changes panel. */
export function changeEntry(file, badge, cls, attrs, stats, actionHtml, rightActionHtml) {
  const idx = file.lastIndexOf('/');
  const name = idx >= 0 ? file.slice(idx + 1) : file;
  const folder = idx >= 0 ? file.slice(0, idx) : '';
  return `<div class="changes-file" title="${escHtml(file)}" ${attrs}>${actionHtml || ''}<span class="changes-badge ${cls}">${badge}</span><span class="changes-file-name">${escHtml(name)}</span>${folder ? `<span class="changes-file-folder">${escHtml(folder)}</span>` : ''}<span class="changes-file-stats">${stats}</span>${rightActionHtml || ''}</div>`;
}

/** Get a human-readable label for a workDir from the sidebar DOM. */
export function getWorkDirLabel(workDir) {
  const wtEl = document.querySelector(`.worktree-item[data-path="${CSS.escape(workDir)}"]`);
  if (wtEl) {
    const entry = wtEl.closest('.project-entry');
    const projectName = entry?.querySelector('.project-name')?.textContent || '';
    const branch = wtEl.textContent.trim();
    return projectName ? `${projectName} / ${branch}` : branch;
  }
  const projEl = document.querySelector(`.project-entry[data-path="${CSS.escape(workDir)}"]`);
  if (projEl) return projEl.querySelector('.project-name')?.textContent || workDir.split('/').pop();
  return workDir.split('/').pop();
}

/** Generate a git branch name from a todo filename and title. */
export function generateTodoBranchName(todoFilename, todoTitle) {
  const num = todoFilename.match(/^(\d+)/)?.[1] || '';
  const slug = todoTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return num ? `todo-${num}-${slug}` : `todo-${slug}`;
}
