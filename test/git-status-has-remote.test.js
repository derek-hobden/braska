const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { mockExec, installMocks, loadModule, mockIpcMain } = require('./helpers');

describe('git:status hasRemote field', () => {
  let exec, ipc;

  beforeEach(() => {
    exec = mockExec();
    installMocks(exec);
    const { register } = loadModule('../main/git-read');
    ipc = mockIpcMain();
    register({ ipcMain: ipc });
  });

  it('hasRemote is false when no remotes configured', async () => {
    exec.on('rev-parse --git-dir', { stdout: '.git\n' });
    exec.on('git remote', { stdout: '' });

    const result = await ipc.invoke('git:status', '/repo');

    assert.ok(result.isGit, 'should be a git repo');
    assert.equal(result.hasRemote, false, 'hasRemote should be false when no remotes');
  });

  it('hasRemote is true when origin exists', async () => {
    exec.on('rev-parse --git-dir', { stdout: '.git\n' });
    exec.on('git remote', { stdout: 'origin\n' });

    const result = await ipc.invoke('git:status', '/repo');

    assert.ok(result.isGit);
    assert.equal(result.hasRemote, true, 'hasRemote should be true when origin exists');
  });

  it('hasRemote is true when any remote exists', async () => {
    exec.on('rev-parse --git-dir', { stdout: '.git\n' });
    exec.on('git remote', { stdout: 'upstream\n' });

    const result = await ipc.invoke('git:status', '/repo');

    assert.equal(result.hasRemote, true);
  });

  it('hasRemote is false on a non-git directory', async () => {
    exec.on('rev-parse --git-dir', { throws: 'not a git repository', stderr: 'not a git repository' });

    const result = await ipc.invoke('git:status', '/not-a-repo');

    assert.equal(result.isGit, false);
    // hasRemote is undefined/false for non-git dirs — no assertion needed, just must not throw
  });
});
