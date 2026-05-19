const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { mockExec, installMocks, loadModule, mockIpcMain } = require('./helpers');

describe('gh:repo-create handler', () => {
  let exec, ipc;

  beforeEach(() => {
    exec = mockExec();
    installMocks(exec);
    const { register } = loadModule('../main/github');
    ipc = mockIpcMain();
    register({ ipcMain: ipc });
  });

  it('creates repo and pushes when commits exist', async () => {
    exec.on('rev-parse HEAD', { stdout: 'abc123\n' });
    exec.on('repo create', { stdout: 'https://github.com/alice/myrepo\n' });

    const result = await ipc.invoke('gh:repo-create', '/project', 'myrepo', 'alice', true, 'My repo');

    assert.ok(result.ok, `expected ok but got: ${result.error}`);
    assert.ok(result.url.includes('github.com'), 'should return a GitHub URL');
    const createCall = exec.calls.find(c => c.args.includes('create'));
    assert.ok(createCall, 'should call gh repo create');
    assert.ok(createCall.args.includes('alice/myrepo'), 'should use owner/name format');
    assert.ok(createCall.args.includes('--private'), 'should set --private for isPrivate=true');
    assert.ok(createCall.args.includes('--push'), 'should push when commits exist');
    assert.ok(createCall.args.includes('--remote'), 'should set --remote');
    assert.ok(createCall.args.includes('origin'), 'should use origin as remote name');
  });

  it('creates repo without push when no commits', async () => {
    exec.on('rev-parse HEAD', { throws: 'fatal: ambiguous argument HEAD', stderr: 'fatal: ambiguous argument HEAD' });
    exec.on('repo create', { stdout: 'https://github.com/alice/myrepo\n' });

    const result = await ipc.invoke('gh:repo-create', '/project', 'myrepo', 'alice', false, '');

    assert.ok(result.ok, `expected ok but got: ${result.error}`);
    assert.ok(result.noCommits, 'should indicate no commits so user knows to push manually');
    const createCall = exec.calls.find(c => c.args.includes('create'));
    assert.ok(createCall, 'should call gh repo create');
    assert.ok(!createCall.args.includes('--push'), 'should NOT push when no commits');
    assert.ok(createCall.args.includes('--public'), 'should set --public for isPrivate=false');
  });

  it('includes description when provided', async () => {
    exec.on('rev-parse HEAD', { stdout: 'abc\n' });
    exec.on('repo create', { stdout: 'https://github.com/alice/myrepo\n' });

    await ipc.invoke('gh:repo-create', '/project', 'myrepo', 'alice', true, 'A description');

    const createCall = exec.calls.find(c => c.args.includes('create'));
    const descIdx = createCall.args.indexOf('--description');
    assert.ok(descIdx >= 0, 'should pass --description');
    assert.equal(createCall.args[descIdx + 1], 'A description');
  });

  it('omits description when empty', async () => {
    exec.on('rev-parse HEAD', { stdout: 'abc\n' });
    exec.on('repo create', { stdout: 'https://github.com/alice/myrepo\n' });

    await ipc.invoke('gh:repo-create', '/project', 'myrepo', 'alice', true, '');

    const createCall = exec.calls.find(c => c.args.includes('create'));
    assert.ok(!createCall.args.includes('--description'), 'should omit --description when empty');
  });

  it('propagates auth error', async () => {
    exec.on('rev-parse HEAD', { stdout: 'abc\n' });
    exec.on('repo create', { throws: 'gh auth login', stderr: 'error: not logged in' });

    const result = await ipc.invoke('gh:repo-create', '/project', 'myrepo', 'alice', true, '');

    assert.ok(!result.ok);
    assert.ok(result.needsAuth, 'should set needsAuth on auth error');
  });

  it('returns ok:false on general error', async () => {
    exec.on('rev-parse HEAD', { stdout: 'abc\n' });
    exec.on('repo create', { throws: 'Name already exists', stderr: 'Name already exists on this account' });

    const result = await ipc.invoke('gh:repo-create', '/project', 'myrepo', 'alice', true, '');

    assert.ok(!result.ok);
    assert.ok(!result.needsAuth);
    assert.ok(result.error, 'should include error message');
  });
});

describe('gh:list-accounts handler', () => {
  let exec, ipc;

  beforeEach(() => {
    exec = mockExec();
    installMocks(exec);
    const { register } = loadModule('../main/github');
    ipc = mockIpcMain();
    register({ ipcMain: ipc });
  });

  it('returns user plus orgs', async () => {
    // orgs rule must come first — mockExec uses substring matching so /user/orgs
    // must be registered before /user to avoid the /user rule matching the orgs URL.
    exec.on('/user/orgs', { stdout: JSON.stringify([{ login: 'myorg' }, { login: 'anotherorg' }]) });
    exec.on('/user', { stdout: JSON.stringify({ login: 'alice', name: 'Alice' }) });

    const result = await ipc.invoke('gh:list-accounts');

    assert.ok(result.ok, `expected ok but got: ${result.error}`);
    assert.ok(Array.isArray(result.accounts));
    assert.equal(result.accounts[0].login, 'alice');
    assert.equal(result.accounts[0].type, 'user');
    assert.equal(result.accounts[1].login, 'myorg');
    assert.equal(result.accounts[1].type, 'org');
    assert.equal(result.accounts[2].login, 'anotherorg');
    assert.equal(result.accounts[2].type, 'org');
  });

  it('returns only user when orgs call fails', async () => {
    exec.on('/user/orgs', { throws: 'API error' });
    exec.on('/user', { stdout: JSON.stringify({ login: 'alice' }) });

    const result = await ipc.invoke('gh:list-accounts');

    assert.ok(result.ok);
    assert.equal(result.accounts.length, 1);
    assert.equal(result.accounts[0].login, 'alice');
  });

  it('propagates auth error', async () => {
    // /user/orgs and /user both fail — only need to stub the first call that throws
    exec.on('/user', { throws: 'authentication required', stderr: 'gh auth login' });

    const result = await ipc.invoke('gh:list-accounts');

    assert.ok(!result.ok);
    assert.ok(result.needsAuth);
  });
});
