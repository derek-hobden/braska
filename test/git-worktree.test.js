const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { mockExec, installMocks, loadModule, mockIpcMain } = require('./helpers');

describe('git:remote-branches handler', () => {
  let exec, ipc;

  beforeEach(() => {
    exec = mockExec();
    installMocks(exec);
    const { register } = loadModule('../main/git-worktree');
    ipc = mockIpcMain();
    register({ ipcMain: ipc });
  });

  it('lists remote branches and filters out HEAD alias', async () => {
    exec.on('branch', { stdout: 'origin/main\norigin/HEAD\norigin/feature-xyz\norigin/claude/issue-48\n' });

    const result = await ipc.invoke('git:remote-branches', '/repo');

    assert.deepEqual(result, ['origin/main', 'origin/feature-xyz', 'origin/claude/issue-48']);
  });

  it('returns empty array when no remote branches exist', async () => {
    exec.on('branch', { stdout: '' });

    const result = await ipc.invoke('git:remote-branches', '/repo');

    assert.deepEqual(result, []);
  });

  it('returns empty array on git error', async () => {
    exec.on('branch', { throws: 'not a git repository' });

    const result = await ipc.invoke('git:remote-branches', '/repo');

    assert.deepEqual(result, []);
  });
});

describe('git:worktree-add handler', () => {
  let exec, ipc;

  beforeEach(() => {
    exec = mockExec();
    installMocks(exec);
    const { register } = loadModule('../main/git-worktree');
    ipc = mockIpcMain();
    register({ ipcMain: ipc });
  });

  it("mode='new' uses -b to create a new local branch", async () => {
    const result = await ipc.invoke('git:worktree-add', '/repo', '/wt/foo', 'feature-x', 'new');
    assert.ok(result.ok);
    const addCall = exec.calls.find(c => c.args[0] === 'worktree' && c.args[1] === 'add');
    assert.deepEqual(addCall.args, ['worktree', 'add', '-b', 'feature-x', '/wt/foo']);
  });

  it("mode='local' checks out an existing local branch", async () => {
    const result = await ipc.invoke('git:worktree-add', '/repo', '/wt/foo', 'feature-x', 'local');
    assert.ok(result.ok);
    const addCall = exec.calls.find(c => c.args[0] === 'worktree' && c.args[1] === 'add');
    assert.deepEqual(addCall.args, ['worktree', 'add', '/wt/foo', 'feature-x']);
  });

  it("mode='remote' creates a local tracking branch from origin/<name>", async () => {
    const result = await ipc.invoke('git:worktree-add', '/repo', '/wt/foo', 'origin/feature-x', 'remote');
    assert.ok(result.ok);
    const addCall = exec.calls.find(c => c.args[0] === 'worktree' && c.args[1] === 'add');
    // Must use -b <localName> so git creates a tracking branch instead of
    // checking out detached HEAD at the remote ref.
    assert.deepEqual(addCall.args, ['worktree', 'add', '-b', 'feature-x', '/wt/foo', 'origin/feature-x']);
  });

  it("mode='remote' strips only the first slash for multi-segment branch names", async () => {
    const result = await ipc.invoke('git:worktree-add', '/repo', '/wt/foo', 'origin/claude/issue-48', 'remote');
    assert.ok(result.ok);
    const addCall = exec.calls.find(c => c.args[0] === 'worktree' && c.args[1] === 'add');
    assert.deepEqual(addCall.args, ['worktree', 'add', '-b', 'claude/issue-48', '/wt/foo', 'origin/claude/issue-48']);
  });
});

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
