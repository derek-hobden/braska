// Create GitHub repo modal — for local git repos not yet on GitHub.

import { modalState, ghState } from './state.js';
import { escHtml } from './utils.js';

const modal = document.getElementById('create-repo-modal');

let _loadProjects = null;
let _refreshGitHub = null;
let _hasCommits = true;

function setError(msg) {
  const el = document.getElementById('create-repo-error');
  if (msg) {
    el.textContent = msg;
    el.classList.add('visible');
  } else {
    el.textContent = '';
    el.classList.remove('visible');
  }
}

function folderName(workDir) {
  if (!workDir) return '';
  const parts = workDir.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || '';
}

function getVisibility() {
  const active = modal.querySelector('.vis-btn.active');
  return active?.dataset.vis || 'private';
}

function setVisibility(vis) {
  modal.querySelectorAll('.vis-btn').forEach(btn => {
    const on = btn.dataset.vis === vis;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
  });
}

function updatePushLabel() {
  const label = document.getElementById('create-repo-push-label');
  label.textContent = _hasCommits ? 'Push commits now' : 'Create initial commit and push';
}

function updateCreateButton() {
  const btn = document.getElementById('create-repo-btn');
  const name = document.getElementById('create-repo-name').value.trim();
  const owner = document.getElementById('create-repo-owner').value;
  btn.disabled = modalState.createRepoBusy || !name || !owner;
  btn.textContent = modalState.createRepoBusy ? 'Creating…' : 'Create';
}

async function populateOwnerDropdown(workDir) {
  const sel = document.getElementById('create-repo-owner');
  sel.innerHTML = '<option value="">Loading…</option>';
  const result = await window.github.authAccounts(workDir);
  if (!result.ok) {
    sel.innerHTML = `<option value="">${escHtml(result.error || 'Failed to load accounts')}</option>`;
    return;
  }
  const options = [result.user, ...result.orgs].filter(Boolean);
  sel.innerHTML = options.map(o => `<option value="${escHtml(o)}">${escHtml(o)}</option>`).join('');
  updateCreateButton();
}

async function detectHasCommits(workDir) {
  try {
    const result = await window.gitDiff.hasCommits(workDir);
    _hasCommits = !!(result && result.hasCommits);
  } catch {
    _hasCommits = true;
  }
  updatePushLabel();
}

export function openCreateRepoModal(workDir) {
  modalState.createRepoWorkDir = workDir;
  modalState.createRepoBusy = false;

  document.getElementById('create-repo-name').value = folderName(workDir);
  document.getElementById('create-repo-description').value = '';
  document.getElementById('create-repo-push').checked = true;
  setVisibility('private');
  _hasCommits = true;
  updatePushLabel();
  setError('');
  updateCreateButton();
  modal.classList.add('active');
  populateOwnerDropdown(workDir);
  detectHasCommits(workDir);
  document.getElementById('create-repo-name').focus();
}

function closeModal() {
  modal.classList.remove('active');
}

async function doCreate() {
  if (modalState.createRepoBusy) return;
  const workDir = modalState.createRepoWorkDir;
  const name = document.getElementById('create-repo-name').value.trim();
  const owner = document.getElementById('create-repo-owner').value;
  const visibility = getVisibility();
  const description = document.getElementById('create-repo-description').value.trim();
  const push = document.getElementById('create-repo-push').checked;
  const initialCommit = push && !_hasCommits;

  if (!name || !owner) return;

  modalState.createRepoBusy = true;
  updateCreateButton();
  setError('');

  const result = await window.github.repoCreate(workDir, { name, owner, visibility, description, push, initialCommit });

  if (!result.ok) {
    modalState.createRepoBusy = false;
    updateCreateButton();
    setError(result.error || 'Failed to create repository.');
    return;
  }

  ghState.cachedAuth = null;

  closeModal();
  await _loadProjects();
  _refreshGitHub(workDir);
}

export function initCreateRepoModal({ loadProjects, refreshGitHub }) {
  _loadProjects = loadProjects;
  _refreshGitHub = refreshGitHub;

  document.getElementById('create-repo-name').addEventListener('input', updateCreateButton);
  document.getElementById('create-repo-owner').addEventListener('change', updateCreateButton);
  document.getElementById('create-repo-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !document.getElementById('create-repo-btn').disabled) doCreate();
  });

  modal.querySelectorAll('.vis-btn').forEach(btn => {
    btn.addEventListener('click', () => setVisibility(btn.dataset.vis));
  });

  document.getElementById('create-repo-cancel').addEventListener('click', closeModal);
  document.getElementById('create-repo-btn').addEventListener('click', doCreate);

  modal.addEventListener('click', (e) => {
    if (e.target === modal && !modalState.createRepoBusy) closeModal();
  });
}
