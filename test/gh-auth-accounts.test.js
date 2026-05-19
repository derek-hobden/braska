const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { mockExec, installMocks, loadModule, mockIpcMain } = require('./helpers');

describe('gh:auth-accounts handler', () => {
  let exec, ipc;

  beforeEach(() => {
    exec = mockExec();
    installMocks(exec);
    const { register } = loadModule('../main/github');
    ipc = mockIpcMain();
    register({ ipcMain: ipc });
  });

  it('returns user and orgs list', async () => {
    exec.on('/user/orgs', { stdout: JSON.stringify([{ login: 'my-org' }, { login: 'other-org' }]) });
    exec.on('/user', { stdout: JSON.stringify({ login: 'alice' }) });

    const result = await ipc.invoke('gh:auth-accounts', '/repo');

    assert.ok(result.ok, `expected ok:true, got: ${JSON.stringify(result)}`);
    assert.equal(result.user, 'alice');
    assert.deepEqual(result.orgs, ['my-org', 'other-org']);
  });

  it('orgs fallback when orgs call fails', async () => {
    exec.on('/user/orgs', { throws: 'permission denied', stderr: 'permission denied' });
    exec.on('/user', { stdout: JSON.stringify({ login: 'alice' }) });

    const result = await ipc.invoke('gh:auth-accounts', '/repo');

    assert.ok(result.ok, `expected ok:true even when orgs fails: ${JSON.stringify(result)}`);
    assert.equal(result.user, 'alice');
    assert.deepEqual(result.orgs, [], 'orgs should be empty on failure');
  });

  it('returns ok:false when user call fails', async () => {
    exec.on('/user', { throws: 'not logged in', stderr: 'not logged in' });

    const result = await ipc.invoke('gh:auth-accounts', '/repo');

    assert.equal(result.ok, false);
    assert.ok(result.error, 'should have error message');
  });
});
