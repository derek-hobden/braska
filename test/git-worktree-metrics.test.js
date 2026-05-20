const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { mockExec, loadModule, mockIpcMain } = require('./helpers');

function installMetricsMocks(exec, worktrees) {
  const utilsPath = require.resolve('../main/utils');
  const projectsPath = require.resolve('../main/projects');

  require.cache[utilsPath] = {
    id: utilsPath, filename: utilsPath, loaded: true,
    exports: {
      execFileAsync: exec.fn,
      errMsg: (err) => ((err.stderr || err.message || '').toString().split('\n')[0]) || 'Unknown error',
      pathExists: async () => true,
      fsp: require('fs').promises,
      resolveInDir: (base, rel) => path.resolve(base, rel),
      resolveGitDir: async () => null,
    },
  };

  require.cache[projectsPath] = {
    id: projectsPath, filename: projectsPath, loaded: true,
    exports: {
      register: () => {},
      getGitInfo: async () => ({ isGit: true, worktrees }),
    },
  };
}

describe('git:worktree-metrics handler', () => {
  let exec, ipc;

  beforeEach(() => {
    exec = mockExec();
  });

  it('includes branch field in metrics for main worktree', async () => {
    installMetricsMocks(exec, [{ path: '/repo', branch: 'main', isMain: true }]);
    // detectDefaultBranch: symbolic-ref returns origin/main → 'main'
    exec.on('symbolic-ref', { stdout: 'refs/remotes/origin/main\n' });
    // rev-parse to verify origin/main exists
    exec.on('rev-parse', { stdout: 'abc123\n' });
    // rev-list for mainStale
    exec.on('rev-list', { stdout: '0\t3\n' });
    // git status
    exec.on('status', { stdout: '' });

    const { register } = loadModule('../main/git-read');
    ipc = mockIpcMain();
    register({ ipcMain: ipc });

    const results = await ipc.invoke('git:worktree-metrics', '/repo');

    assert.equal(results.length, 1);
    assert.equal(results[0].branch, 'main', 'metrics must include branch field');
    assert.equal(results[0].isMain, true);
  });

  it('includes branch field for feature worktree', async () => {
    installMetricsMocks(exec, [
      { path: '/repo', branch: 'main', isMain: true },
      { path: '/repo-wt/feat', branch: 'feat/thing', isMain: false },
    ]);
    exec.on('symbolic-ref', { stdout: 'refs/remotes/origin/main\n' });
    exec.on('rev-parse', { stdout: 'abc123\n' });
    exec.on('rev-list', { stdout: '0\t0\n' });
    exec.on('status', { stdout: '' });

    const { register } = loadModule('../main/git-read');
    ipc = mockIpcMain();
    register({ ipcMain: ipc });

    const results = await ipc.invoke('git:worktree-metrics', '/repo');

    assert.equal(results.length, 2);
    assert.equal(results[1].branch, 'feat/thing');
    assert.equal(results[1].isMain, false);
  });

  it('branch is null when wt.branch is missing', async () => {
    installMetricsMocks(exec, [{ path: '/repo', isMain: true }]);
    exec.on('symbolic-ref', { stdout: 'refs/remotes/origin/main\n' });
    exec.on('rev-parse', { stdout: 'abc123\n' });
    exec.on('rev-list', { stdout: '0\t0\n' });
    exec.on('status', { stdout: '' });

    const { register } = loadModule('../main/git-read');
    ipc = mockIpcMain();
    register({ ipcMain: ipc });

    const results = await ipc.invoke('git:worktree-metrics', '/repo');

    assert.equal(results[0].branch, null, 'branch should be null when wt.branch is absent');
  });
});
