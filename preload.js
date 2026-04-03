const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('versions', {
  node: () => process.versions.node,
  chrome: () => process.versions.chrome,
  electron: () => process.versions.electron,
});

contextBridge.exposeInMainWorld('projects', {
  list: () => ipcRenderer.invoke('projects:list'),
  add: () => ipcRenderer.invoke('projects:add'),
  remove: (projectPath) => ipcRenderer.invoke('projects:remove', projectPath),
});

contextBridge.exposeInMainWorld('skills', {
  list: () => ipcRenderer.invoke('skills:list'),
  save: (name, content) => ipcRenderer.invoke('skills:save', name, content),
  remove: (name) => ipcRenderer.invoke('skills:remove', name),
});

contextBridge.exposeInMainWorld('specialists', {
  list: () => ipcRenderer.invoke('specialists:list'),
  save: (name, instructions, skills) => ipcRenderer.invoke('specialists:save', name, instructions, skills),
  remove: (name) => ipcRenderer.invoke('specialists:remove', name),
});

contextBridge.exposeInMainWorld('filetree', {
  list: (workDir, relDir) => ipcRenderer.invoke('filetree:list', workDir, relDir),
  watch: (dirPath) => ipcRenderer.send('filetree:watch', dirPath),
  unwatch: () => ipcRenderer.send('filetree:unwatch'),
  onChange: (cb) => ipcRenderer.on('filetree:changed', (_ev, filename) => cb(filename)),
});

contextBridge.exposeInMainWorld('fileOps', {
  createFile: (workDir, relDir, name)            => ipcRenderer.invoke('filetree:create-file', workDir, relDir, name),
  createDir:  (workDir, relDir, name)            => ipcRenderer.invoke('filetree:create-dir', workDir, relDir, name),
  rename:     (workDir, relPath, newName)        => ipcRenderer.invoke('filetree:rename', workDir, relPath, newName),
  delete:     (workDir, relPath)                 => ipcRenderer.invoke('filetree:delete', workDir, relPath),
  reveal:     (workDir, relPath)                 => ipcRenderer.invoke('filetree:reveal', workDir, relPath),
  gitignore:  (workDir, relPath)                 => ipcRenderer.invoke('filetree:gitignore', workDir, relPath),
  copyIn:     (workDir, targetRelDir, srcPaths)  => ipcRenderer.invoke('filetree:copy-in', workDir, targetRelDir, srcPaths),
});

contextBridge.exposeInMainWorld('fileEditor', {
  read: (workDir, relPath) => ipcRenderer.invoke('file:read', workDir, relPath),
  save: (workDir, relPath, content) => ipcRenderer.invoke('file:save', workDir, relPath, content),
});

contextBridge.exposeInMainWorld('todo', {
  init: (workDir) => ipcRenderer.invoke('todo:init', workDir),
  list: (workDir) => ipcRenderer.invoke('todo:list', workDir),
  read: (workDir, relPath) => ipcRenderer.invoke('todo:read', workDir, relPath),
  close: (workDir, relPath, status) => ipcRenderer.invoke('todo:close', workDir, relPath, status),
  watch: (workDir) => ipcRenderer.send('todo:watch', workDir),
  unwatch: () => ipcRenderer.send('todo:unwatch'),
  onChange: (cb) => ipcRenderer.on('todo:changed', () => cb()),
});

contextBridge.exposeInMainWorld('worktree', {
  branches: (workDir) => ipcRenderer.invoke('git:branches', workDir),
  add: (workDir, worktreePath, branch, createNew) => ipcRenderer.invoke('git:worktree-add', workDir, worktreePath, branch, createNew),
  remove: (workDir, worktreePath, force, deleteBranch) => ipcRenderer.invoke('git:worktree-remove', workDir, worktreePath, force, deleteBranch),
  prune: (workDir) => ipcRenderer.invoke('git:worktree-prune', workDir),
  lock: (workDir, worktreePath, unlock) => ipcRenderer.invoke('git:worktree-lock', workDir, worktreePath, unlock),
  mergePreflight: (workDir, worktreePath) => ipcRenderer.invoke('git:merge-preflight', workDir, worktreePath),
  mergeAndCleanup: (workDir, worktreePath, force) => ipcRenderer.invoke('git:merge-and-cleanup', workDir, worktreePath, force),
  metrics: (projectPath) => ipcRenderer.invoke('git:worktree-metrics', projectPath),
});

contextBridge.exposeInMainWorld('gitDiff', {
  status: (workDir) => ipcRenderer.invoke('git:status', workDir),
  diff: (workDir, filePath, staged) => ipcRenderer.invoke('git:diff', workDir, filePath, staged),
  log: (workDir, count) => ipcRenderer.invoke('git:log', workDir, count),
  commitFiles: (workDir, hash) => ipcRenderer.invoke('git:commit-files', workDir, hash),
  diffCommit: (workDir, hash, filePath) => ipcRenderer.invoke('git:diff-commit', workDir, hash, filePath),
  currentBranch: (workDir) => ipcRenderer.invoke('git:current-branch', workDir),
  branchList: (workDir) => ipcRenderer.invoke('git:branch-list', workDir),
  stashList: (workDir) => ipcRenderer.invoke('git:stash-list', workDir),
});

contextBridge.exposeInMainWorld('gitOps', {
  stage: (workDir, filePaths) => ipcRenderer.invoke('git:stage', workDir, filePaths),
  unstage: (workDir, filePaths) => ipcRenderer.invoke('git:unstage', workDir, filePaths),
  commit: (workDir, message) => ipcRenderer.invoke('git:commit', workDir, message),
  generateCommitMsg: (workDir) => ipcRenderer.invoke('git:generate-commit-msg', workDir),
  fetch: (workDir) => ipcRenderer.invoke('git:fetch', workDir),
  pull: (workDir) => ipcRenderer.invoke('git:pull', workDir),
  push: (workDir) => ipcRenderer.invoke('git:push', workDir),
  pushSetUpstream: (workDir, branch) => ipcRenderer.invoke('git:push-set-upstream', workDir, branch),
  branchCreate: (workDir, name, startPoint) => ipcRenderer.invoke('git:branch-create', workDir, name, startPoint),
  branchSwitch: (workDir, name) => ipcRenderer.invoke('git:branch-switch', workDir, name),
  branchDelete: (workDir, name, force) => ipcRenderer.invoke('git:branch-delete', workDir, name, force),
  stashSave: (workDir, message) => ipcRenderer.invoke('git:stash-save', workDir, message),
  stashPop: (workDir, index) => ipcRenderer.invoke('git:stash-pop', workDir, index),
  stashDrop: (workDir, index) => ipcRenderer.invoke('git:stash-drop', workDir, index),
  stageAll: (workDir) => ipcRenderer.invoke('git:stage-all', workDir),
  pullLatestMain: (workDir, options) => ipcRenderer.invoke('git:pull-latest-main', workDir, options),
  abortMerge: (workDir) => ipcRenderer.invoke('git:abort-merge', workDir),
  restoreWorkingTree: (workDir) => ipcRenderer.invoke('git:restore-working-tree', workDir),
  discard: (workDir, filePaths) => ipcRenderer.invoke('git:discard', workDir, filePaths),
  amend: (workDir, message) => ipcRenderer.invoke('git:amend', workDir, message),
  revertCommit: (workDir, hash) => ipcRenderer.invoke('git:revert-commit', workDir, hash),
});

contextBridge.exposeInMainWorld('github', {
  authStatus: (workDir) => ipcRenderer.invoke('gh:auth-status', workDir),
  prList: (workDir, state) => ipcRenderer.invoke('gh:pr-list', workDir, state),
  prView: (workDir, number) => ipcRenderer.invoke('gh:pr-view', workDir, number),
  prCreate: (workDir, title, body, base, draft) => ipcRenderer.invoke('gh:pr-create', workDir, title, body, base, draft),
  prMerge: (workDir, number, method, deleteBranch) => ipcRenderer.invoke('gh:pr-merge', workDir, number, method, deleteBranch),
  prClose: (workDir, number) => ipcRenderer.invoke('gh:pr-close', workDir, number),
  prComment: (workDir, number, body) => ipcRenderer.invoke('gh:pr-comment', workDir, number, body),
  issueList: (workDir, state, labels) => ipcRenderer.invoke('gh:issue-list', workDir, state, labels),
  issueView: (workDir, number) => ipcRenderer.invoke('gh:issue-view', workDir, number),
  issueCreate: (workDir, title, body, labels) => ipcRenderer.invoke('gh:issue-create', workDir, title, body, labels),
  issueClose: (workDir, number) => ipcRenderer.invoke('gh:issue-close', workDir, number),
  issueComment: (workDir, number, body) => ipcRenderer.invoke('gh:issue-comment', workDir, number, body),
  issueLabels: (workDir) => ipcRenderer.invoke('gh:issue-labels', workDir),
  runList: (workDir, branch) => ipcRenderer.invoke('gh:run-list', workDir, branch),
  runView: (workDir, runId) => ipcRenderer.invoke('gh:run-view', workDir, runId),
  notifications: (workDir) => ipcRenderer.invoke('gh:notifications', workDir),
  linkTicket: (workDir, todoPath, issueNumber) => ipcRenderer.invoke('gh:link-ticket', workDir, todoPath, issueNumber),
  unlinkTicket: (workDir, todoPath) => ipcRenderer.invoke('gh:unlink-ticket', workDir, todoPath),
});

// PTY bridge — thin IPC layer, multi-tab support
const dataCallbacks = new Map();
const exitCallbacks = new Map();

ipcRenderer.on('pty:data', (_ev, id, data) => { const cb = dataCallbacks.get(id); if (cb) cb(data); });
ipcRenderer.on('pty:exit', (_ev, id, code) => {
  const cb = exitCallbacks.get(id);
  if (cb) cb(code);
  dataCallbacks.delete(id);
  exitCallbacks.delete(id);
});

contextBridge.exposeInMainWorld('pty', {
  spawn: (specialistName, workDir, dims, initialPrompt) => ipcRenderer.invoke('pty:spawn', specialistName, workDir, dims, initialPrompt),
  write: (id, data) => ipcRenderer.send('pty:write', id, data),
  resize: (id, cols, rows) => ipcRenderer.send('pty:resize', id, cols, rows),
  kill: (id) => ipcRenderer.invoke('pty:kill', id),
  onData: (id, cb) => { dataCallbacks.set(id, cb); },
  onExit: (id, cb) => { exitCallbacks.set(id, cb); },
  removeListeners: (id) => { dataCallbacks.delete(id); exitCallbacks.delete(id); },
});

// Close-active-tab bridge (Cmd+W interception from main process)
// Open-tab-picker bridge (Cmd+T interception from main process)
contextBridge.exposeInMainWorld('windowActions', {
  onCloseActiveTab: (cb) => ipcRenderer.on('close-active-tab', () => cb()),
  onOpenTabPicker: (cb) => ipcRenderer.on('open-tab-picker', () => cb()),
  onRenameActiveTab: (cb) => ipcRenderer.on('rename-active-tab', () => cb()),
});

// Drag-drop file path resolution.
// File.path is deprecated in Electron 29+; webUtils.getPathForFile is the replacement.
// File objects can't cross the context bridge, so we extract paths here in the preload
// during the capture phase, then the renderer retrieves them synchronously.
let lastDroppedPaths = [];
document.addEventListener('drop', (e) => {
  const files = e.dataTransfer?.files;
  let paths = [];
  if (files && files.length > 0) {
    paths = Array.from(files).map(f => {
      try { return webUtils.getPathForFile(f); }
      catch { return ''; }
    }).filter(Boolean);
  }
  // Fallback for Screen Share drags: File objects transferred via the screen-sharing
  // protocol have no resolvable native path via webUtils. Try text/uri-list instead,
  // which Screen Share may populate with file:// URIs even when File.path is absent.
  if (paths.length === 0) {
    const uriList = e.dataTransfer?.getData('text/uri-list') || '';
    paths = uriList.split('\n')
      .map(u => u.trim())
      .filter(u => u.startsWith('file://'))
      .map(u => { try { return decodeURIComponent(new URL(u).pathname); } catch { return ''; } })
      .filter(Boolean);
  }
  if (paths.length > 0) lastDroppedPaths = paths;
}, true); // capture phase — runs before renderer bubble-phase handlers

contextBridge.exposeInMainWorld('dragDrop', {
  getLastDroppedPaths: () => {
    const paths = [...lastDroppedPaths];
    lastDroppedPaths = [];
    return paths;
  },
});
