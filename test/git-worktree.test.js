// Tests for Fix 3: git:pull-latest-main should work even when the current
// branch IS the main branch (remove the early-return guard).

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { mockExec, installMocks, loadModule, mockIpcMain } = require('./helpers');

describe('git:pull-latest-main handler', () => {
  let exec, ipc;

  beforeEach(() => {
    exec = mockExec();
    installMocks(exec);
    const { register } = loadModule('../main/git-worktree');
    ipc = mockIpcMain();
    register({ ipcMain: ipc });
  });

  it('works when current branch IS the main branch', async () => {
    // rev-parse --show-toplevel for finding repo root
    exec.on('--show-toplevel', { stdout: '/repo\n' });
    // symbolic-ref to get current branch
    exec.on('symbolic-ref', { stdout: 'main\n' });
    // status --porcelain (no dirty files)
    exec.on('--porcelain', { stdout: '' });
    // remote check
    exec.on('git remote', { stdout: 'origin\n' });
    // fetch origin main
    exec.on('fetch', { stdout: '' });
    // merge-base --is-ancestor should FAIL (not up to date)
    exec.on('merge-base', { throws: 'not ancestor' });
    // merge origin/main succeeds
    exec.on('merge', { stdout: 'Updating abc..def\nFast-forward\n' });

    const result = await ipc.invoke('git:pull-latest-main', '/repo');

    // OLD behavior: { ok: false, error: 'Already on the main branch...' }
    // NEW behavior: should succeed
    assert.ok(result.ok, `expected ok:true but got: ${JSON.stringify(result)}`);
  });

  it('returns alreadyUpToDate when main is current on main branch', async () => {
    exec.on('--show-toplevel', { stdout: '/repo\n' });
    exec.on('symbolic-ref', { stdout: 'main\n' });
    exec.on('--porcelain', { stdout: '' });
    exec.on('git remote', { stdout: 'origin\n' });
    exec.on('fetch', { stdout: '' });
    // merge-base --is-ancestor SUCCEEDS (already up to date)
    exec.on('merge-base', { stdout: '' });

    const result = await ipc.invoke('git:pull-latest-main', '/repo');

    assert.ok(result.ok);
    assert.equal(result.alreadyUpToDate, true);
  });

  it('still works for feature branches (existing behavior)', async () => {
    exec.on('--show-toplevel', { stdout: '/repo\n' });
    exec.on('symbolic-ref', { stdout: 'feat/thing\n' });
    exec.on('--porcelain', { stdout: '' });
    exec.on('git remote', { stdout: 'origin\n' });
    exec.on('fetch', { stdout: '' });
    exec.on('merge-base', { throws: 'not ancestor' });
    exec.on('merge', { stdout: 'Merge made by ort\n' });

    const result = await ipc.invoke('git:pull-latest-main', '/repo/worktrees/feat');

    assert.ok(result.ok, `expected ok:true but got: ${JSON.stringify(result)}`);
  });

  it('handles dirty files on main branch same as feature branches', async () => {
    exec.on('--show-toplevel', { stdout: '/repo\n' });
    exec.on('symbolic-ref', { stdout: 'main\n' });
    exec.on('--porcelain', { stdout: ' M file.js\n' });

    const result = await ipc.invoke('git:pull-latest-main', '/repo');

    // Should report dirty, not "Already on main"
    assert.equal(result.ok, false);
    assert.equal(result.isDirty, true);
    assert.equal(result.dirtyCount, 1);
  });
});
