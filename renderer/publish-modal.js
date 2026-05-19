// Publish to GitHub modal — collects name, account, visibility, description,
// then calls gh:repo-create to create the remote repo and set origin.

import { modalState } from './state.js';
import { escHtml } from './utils.js';

const modal = document.getElementById('publish-modal');
const nameInput = document.getElementById('publish-repo-name');
const accountSelect = document.getElementById('publish-account-select');
const descriptionInput = document.getElementById('publish-description');
const errorEl = document.getElementById('publish-error');
const submitBtn = document.getElementById('publish-submit');

let _loadProjects = null;
let _refreshChanges = null;
let _getActiveWorkDir = null;
let _activeWorkDir = null;
let _accountsLoaded = false;

function getVisibility() {
  return document.querySelector('input[name="publish-visibility"]:checked')?.value === 'public';
}

function setError(msg) {
  if (msg) { errorEl.textContent = msg; errorEl.classList.add('visible'); }
  else { errorEl.textContent = ''; errorEl.classList.remove('visible'); }
}

function updateSubmitBtn() {
  submitBtn.disabled = modalState.publishBusy ||
    !nameInput.value.trim() ||
    !accountSelect.value;
}

async function loadAccounts() {
  accountSelect.innerHTML = '<option value="">Loading…</option>';
  accountSelect.disabled = true;
  const result = await window.github.listAccounts();
  if (!result.ok) {
    const hint = result.needsAuth
      ? 'Run `gh auth login` in a terminal, then try again.'
      : (result.error || 'Failed to load accounts.');
    accountSelect.innerHTML = `<option value="">${escHtml(hint)}</option>`;
    return;
  }
  _accountsLoaded = true;
  accountSelect.innerHTML = result.accounts
    .map(a => `<option value="${escHtml(a.login)}">${escHtml(a.login)}${a.type === 'org' ? ' (org)' : ''}</option>`)
    .join('');
  accountSelect.disabled = false;
  updateSubmitBtn();
}

export function openPublishModal(workDir) {
  _activeWorkDir = workDir || (_getActiveWorkDir ? _getActiveWorkDir() : null);
  if (!_activeWorkDir) return;

  // Pre-fill name from the folder basename.
  const folderName = _activeWorkDir.split('/').filter(Boolean).pop() || '';
  nameInput.value = folderName;
  descriptionInput.value = '';
  document.querySelector('input[name="publish-visibility"][value="private"]').checked = true;
  setError('');
  modalState.publishBusy = false;
  submitBtn.textContent = 'Publish';

  _accountsLoaded = false;
  loadAccounts();
  updateSubmitBtn();

  modal.classList.add('active');
  nameInput.focus();
  nameInput.select();
}

function closeModal() {
  modal.classList.remove('active');
  _activeWorkDir = null;
}

async function doPublish() {
  if (modalState.publishBusy) return;
  const name = nameInput.value.trim();
  const owner = accountSelect.value;
  if (!name || !owner) return;

  const isPrivate = !getVisibility();
  const description = descriptionInput.value.trim();

  modalState.publishBusy = true;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Publishing…';
  setError('');

  const result = await window.github.repoCreate(_activeWorkDir, name, owner, isPrivate, description);

  modalState.publishBusy = false;
  submitBtn.textContent = 'Publish';

  if (!result.ok) {
    submitBtn.disabled = false;
    const hint = result.needsAuth
      ? ' Run `gh auth login` in a terminal and try again.'
      : '';
    setError((result.error || 'Failed to create repository.') + hint);
    return;
  }

  closeModal();
  await _loadProjects?.();
  if (_activeWorkDir && _refreshChanges) _refreshChanges(_activeWorkDir);

  if (result.noCommits) {
    // Repo was created but nothing was pushed — surface an informational message
    // via a brief status in the changes panel. We don't have a direct status
    // fn reference here, so use a native alert (low-frequency path).
    alert(`Repository created at ${result.url}\n\nNo commits to push yet — make your first commit and then push.`);
  }
}

export function initPublishModal({ loadProjects, refreshChanges, getActiveWorkDir }) {
  _loadProjects = loadProjects;
  _refreshChanges = refreshChanges;
  _getActiveWorkDir = getActiveWorkDir;

  nameInput.addEventListener('input', updateSubmitBtn);
  accountSelect.addEventListener('change', updateSubmitBtn);

  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !submitBtn.disabled) doPublish();
  });

  document.getElementById('publish-cancel').addEventListener('click', closeModal);
  submitBtn.addEventListener('click', doPublish);

  modal.addEventListener('click', (e) => {
    if (e.target === modal && !modalState.publishBusy) closeModal();
  });
}
