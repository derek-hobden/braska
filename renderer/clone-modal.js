// Clone from GitHub modal — paste URL or pick from your repos, choose dest, clone via gh.

import { modalState } from './state.js';
import { escHtml, timeAgo } from './utils.js';

const cloneModal = document.getElementById('clone-modal');

let _loadProjects;
let _openWorkDir;
let _reposLoaded = false;
let _repos = [];

function parseRepoRef(input) {
  const s = (input || '').trim();
  if (!s) return null;
  let m;
  m = s.match(/^git@github\.com:([^/\s]+)\/(.+?)(?:\.git)?\/?$/);
  if (m) return `${m[1]}/${m[2]}`;
  m = s.match(/^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?(?:\/.*)?$/);
  if (m) return `${m[1]}/${m[2]}`;
  m = s.match(/^([A-Za-z0-9][\w.-]*)\/([A-Za-z0-9][\w.-]+?)(?:\.git)?$/);
  if (m) return `${m[1]}/${m[2]}`;
  return null;
}

function repoNameFromRef(repoRef) {
  if (!repoRef) return '';
  const idx = repoRef.lastIndexOf('/');
  return idx >= 0 ? repoRef.slice(idx + 1) : repoRef;
}

function setError(msg) {
  const el = document.getElementById('clone-error');
  if (msg) {
    el.textContent = msg;
    el.classList.add('visible');
  } else {
    el.textContent = '';
    el.classList.remove('visible');
  }
}

function updateTargetPreview() {
  const preview = document.getElementById('clone-target-preview');
  const name = repoNameFromRef(modalState.cloneRepoRef);
  if (modalState.cloneDestParent && name) {
    preview.textContent = `Will clone into: ${modalState.cloneDestParent}/${name}`;
    preview.classList.add('visible');
  } else {
    preview.textContent = '';
    preview.classList.remove('visible');
  }
}

function updateCloneButton() {
  const btn = document.getElementById('clone-btn');
  btn.disabled = modalState.cloneBusy || !modalState.cloneRepoRef || !modalState.cloneDestParent;
  btn.textContent = modalState.cloneBusy ? 'Cloning…' : 'Clone';
}

function switchTab(tab) {
  modalState.cloneSource = tab;
  document.querySelectorAll('.clone-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  document.querySelectorAll('.clone-tab-body').forEach(b => {
    b.classList.toggle('hidden', b.dataset.panel !== tab);
  });
  // Re-derive the active repoRef from whatever the new tab is currently showing,
  // so state doesn't bleed across tabs.
  if (tab === 'url') {
    modalState.cloneRepoRef = parseRepoRef(document.getElementById('clone-url-input').value) || '';
  } else {
    const selected = document.querySelector('.clone-repo-row.selected');
    modalState.cloneRepoRef = selected ? selected.dataset.ref : '';
    if (!_reposLoaded) loadRepoList();
  }
  updateTargetPreview();
  updateCloneButton();
}

function renderRepoList(repos, filter) {
  const list = document.getElementById('clone-repo-list');
  const q = (filter || '').trim().toLowerCase();
  const filtered = q
    ? repos.filter(r => r.nameWithOwner.toLowerCase().includes(q) || (r.description || '').toLowerCase().includes(q))
    : repos;
  if (!filtered.length) {
    list.innerHTML = '<div class="clone-repo-empty">No matching repos.</div>';
    return;
  }
  list.innerHTML = filtered.map(r => {
    const isPrivate = r.isPrivate || (r.visibility && r.visibility.toUpperCase() === 'PRIVATE');
    const chip = isPrivate ? 'private' : 'public';
    const updated = r.updatedAt ? timeAgo(r.updatedAt) : '';
    return `<div class="clone-repo-row" data-ref="${escHtml(r.nameWithOwner)}">
      <div class="clone-repo-main">
        <span class="clone-repo-name">${escHtml(r.nameWithOwner)}</span>
        <span class="clone-repo-chip ${chip}">${chip}</span>
        ${r.isFork ? '<span class="clone-repo-chip fork">fork</span>' : ''}
      </div>
      ${r.description ? `<div class="clone-repo-desc">${escHtml(r.description)}</div>` : ''}
      ${updated ? `<div class="clone-repo-meta">updated ${updated}</div>` : ''}
    </div>`;
  }).join('');
}

async function loadRepoList() {
  const list = document.getElementById('clone-repo-list');
  list.innerHTML = '<div class="clone-repo-loading">Loading your repos…</div>';
  const result = await window.github.listRepos();
  if (!result.ok) {
    const hint = result.needsAuth ? '<div class="clone-repo-hint">Run <code>gh auth login</code> in a terminal, then try again.</div>' : '';
    list.innerHTML = `<div class="clone-repo-error">${escHtml(result.error || 'Failed to load repos.')}</div>${hint}`;
    return;
  }
  _repos = result.repos || [];
  _reposLoaded = true;
  renderRepoList(_repos, document.getElementById('clone-repo-filter').value);
}

function selectRepoRef(ref) {
  modalState.cloneRepoRef = ref;
  document.querySelectorAll('.clone-repo-row').forEach(el => {
    el.classList.toggle('selected', el.dataset.ref === ref);
  });
  updateTargetPreview();
  updateCloneButton();
  setError('');
}

export function openCloneModal() {
  modalState.cloneSource = 'url';
  modalState.cloneRepoRef = '';
  modalState.cloneDestParent = '';
  modalState.cloneBusy = false;

  document.getElementById('clone-url-input').value = '';
  document.getElementById('clone-url-preview').textContent = '';
  document.getElementById('clone-repo-filter').value = '';
  document.getElementById('clone-dest-text').value = '';
  document.getElementById('clone-target-preview').textContent = '';
  document.getElementById('clone-target-preview').classList.remove('visible');
  setError('');
  switchTab('url');
  updateCloneButton();

  cloneModal.classList.add('active');
  document.getElementById('clone-url-input').focus();
}

function closeModal() {
  cloneModal.classList.remove('active');
}

async function doClone() {
  if (modalState.cloneBusy) return;
  const ref = modalState.cloneRepoRef;
  const destParent = modalState.cloneDestParent;
  if (!ref || !destParent) return;
  const name = repoNameFromRef(ref);
  const targetDir = `${destParent}/${name}`;

  modalState.cloneBusy = true;
  updateCloneButton();
  setError('');

  const cloneResult = await window.github.clone(ref, targetDir);
  if (!cloneResult.ok) {
    modalState.cloneBusy = false;
    updateCloneButton();
    setError(cloneResult.error || 'Clone failed.');
    return;
  }

  const addResult = await window.projects.addCloned(targetDir);
  modalState.cloneBusy = false;
  if (!addResult.ok) {
    setError(addResult.error || 'Cloned, but failed to register project.');
    updateCloneButton();
    return;
  }

  closeModal();
  await _loadProjects();
  _openWorkDir(targetDir);
}

export function initCloneModal({ loadProjects, openWorkDir }) {
  _loadProjects = loadProjects;
  _openWorkDir = openWorkDir;

  document.querySelectorAll('.clone-tab').forEach(t => {
    t.addEventListener('click', () => switchTab(t.dataset.tab));
  });

  const urlInput = document.getElementById('clone-url-input');
  urlInput.addEventListener('input', () => {
    const parsed = parseRepoRef(urlInput.value);
    const preview = document.getElementById('clone-url-preview');
    if (urlInput.value.trim() && parsed) {
      preview.textContent = `Will clone: ${parsed}`;
      preview.classList.remove('error');
      modalState.cloneRepoRef = parsed;
    } else if (urlInput.value.trim()) {
      preview.textContent = 'Could not parse repo. Use owner/repo or a github.com URL.';
      preview.classList.add('error');
      modalState.cloneRepoRef = '';
    } else {
      preview.textContent = '';
      preview.classList.remove('error');
      modalState.cloneRepoRef = '';
    }
    updateTargetPreview();
    updateCloneButton();
    setError('');
  });
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !document.getElementById('clone-btn').disabled) doClone();
  });

  document.getElementById('clone-repo-filter').addEventListener('input', (e) => {
    if (_reposLoaded) renderRepoList(_repos, e.target.value);
  });

  document.getElementById('clone-repo-list').addEventListener('click', (e) => {
    const row = e.target.closest('.clone-repo-row');
    if (!row) return;
    selectRepoRef(row.dataset.ref);
  });

  document.getElementById('clone-pick-dest-btn').addEventListener('click', async () => {
    const result = await window.projects.pickCloneDir();
    if (!result.ok) return;
    modalState.cloneDestParent = result.path;
    document.getElementById('clone-dest-text').value = result.path;
    updateTargetPreview();
    updateCloneButton();
    setError('');
  });

  document.getElementById('clone-cancel').addEventListener('click', closeModal);
  document.getElementById('clone-btn').addEventListener('click', doClone);

  cloneModal.addEventListener('click', (e) => {
    if (e.target === cloneModal && !modalState.cloneBusy) closeModal();
  });
}
