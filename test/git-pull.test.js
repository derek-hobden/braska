// Tests for Fix 1: git:pull should determine the current branch and use
// `git pull origin <branch>` instead of bare `git pull`.

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { mockExec, installMocks, loadModule, mockIpcMain } = require('./helpers');

describe('git:pull handler', () => {
  let exec, ipc;

  beforeEach(() => {
    exec = mockExec();
    installMocks(exec);
    const { register } = loadModule('../main/git-ops');
    ipc = mockIpcMain();
    register({ ipcMain: ipc });
  });

  it('determines the current branch and pulls with origin/<branch>', async () => {
    exec.on('symbolic-ref', { stdout: 'main\n' });
    exec.on('pull', { stdout: 'Already up to date.\n' });

    const result = await ipc.invoke('git:pull', '/repo');

    assert.ok(result.ok, 'should succeed');
    // Find the pull call — it must include 'origin' and 'main'
    const pullCall = exec.calls.find(c => c.args.includes('pull'));
    assert.ok(pullCall, 'should have called git pull');
    assert.ok(pullCall.args.includes('origin'), 'should pull from origin');
    assert.ok(pullCall.args.includes('main'), 'should pull the detected branch');
  });

  it('pulls the correct branch on a feature worktree', async () => {
    exec.on('symbolic-ref', { stdout: 'feat/cool-thing\n' });
    exec.on('pull', { stdout: 'Updating abc..def\n' });

    const result = await ipc.invoke('git:pull', '/repo/worktrees/feat');

    assert.ok(result.ok);
    const pullCall = exec.calls.find(c => c.args.includes('pull'));
    assert.ok(pullCall.args.includes('feat/cool-thing'),
      'should pull the feature branch, not hardcoded main');
  });

  it('returns ok:false with error when pull fails', async () => {
    exec.on('symbolic-ref', { stdout: 'main\n' });
    exec.on('pull', { throws: 'fatal: bad thing', stderr: 'fatal: bad thing' });

    const result = await ipc.invoke('git:pull', '/repo');

    assert.equal(result.ok, false);
    assert.ok(result.error.includes('fatal'), `error should contain stderr: ${result.error}`);
  });

  it('detects merge conflicts', async () => {
    exec.on('symbolic-ref', { stdout: 'main\n' });
    exec.on('pull', {
      throws: 'Automatic merge failed',
      stderr: 'CONFLICT (content): Merge conflict in file.js\nAutomatic merge failed',
    });

    const result = await ipc.invoke('git:pull', '/repo');

    assert.equal(result.ok, false);
    assert.equal(result.hasConflicts, true);
  });

  it('still works if branch detection fails (fallback to bare pull)', async () => {
    exec.on('symbolic-ref', { throws: 'fatal: not a git repo' });
    exec.on('pull', { stdout: 'Already up to date.\n' });

    const result = await ipc.invoke('git:pull', '/repo');

    assert.ok(result.ok, 'should still succeed with fallback');
  });
});
