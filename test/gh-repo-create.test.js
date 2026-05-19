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

  it('creates repo with correct gh args (public, push)', async () => {
    exec.on('repo create', { stdout: 'https://github.com/alice/myapp\n' });

    const result = await ipc.invoke('gh:repo-create', '/repo', {
      name: 'myapp', owner: 'alice', visibility: 'public', description: '', push: true,
    });

    assert.ok(result.ok, `expected ok:true, got: ${JSON.stringify(result)}`);
    assert.equal(result.url, 'https://github.com/alice/myapp');

    const call = exec.calls.find(c => c.args.includes('repo') && c.args.includes('create'));
    assert.ok(call, 'should have called gh repo create');
    assert.ok(call.args.includes('alice/myapp'), 'should include owner/name');
    assert.ok(call.args.includes('--source'), 'should include --source');
    assert.ok(call.args.includes('/repo'), 'should pass workDir as source');
    assert.ok(call.args.includes('--remote'), 'should include --remote');
    assert.ok(call.args.includes('origin'), 'remote should be origin');
    assert.ok(call.args.includes('--public'), 'should include --public');
    assert.ok(call.args.includes('--push'), 'should include --push');
  });

  it('creates private repo with description', async () => {
    exec.on('repo create', { stdout: 'https://github.com/alice/secret\n' });

    const result = await ipc.invoke('gh:repo-create', '/repo', {
      name: 'secret', owner: 'alice', visibility: 'private', description: 'My secret repo', push: true,
    });

    assert.ok(result.ok);
    const call = exec.calls.find(c => c.args.includes('repo') && c.args.includes('create'));
    assert.ok(call.args.includes('--private'), 'should include --private');
    assert.ok(!call.args.includes('--public'), 'should not include --public');
    const descIdx = call.args.indexOf('--description');
    assert.ok(descIdx >= 0, 'should include --description flag');
    assert.equal(call.args[descIdx + 1], 'My secret repo', 'description value should follow flag');
  });

  it('omits --push when push is false', async () => {
    exec.on('repo create', { stdout: 'https://github.com/alice/myapp\n' });

    await ipc.invoke('gh:repo-create', '/repo', {
      name: 'myapp', owner: 'alice', visibility: 'public', description: '', push: false,
    });

    const call = exec.calls.find(c => c.args.includes('repo') && c.args.includes('create'));
    assert.ok(!call.args.includes('--push'), 'should not include --push when push=false');
  });

  it('omits --description when description is empty', async () => {
    exec.on('repo create', { stdout: 'https://github.com/alice/myapp\n' });

    await ipc.invoke('gh:repo-create', '/repo', {
      name: 'myapp', owner: 'alice', visibility: 'public', description: '', push: false,
    });

    const call = exec.calls.find(c => c.args.includes('repo') && c.args.includes('create'));
    assert.ok(!call.args.includes('--description'), 'should omit --description when empty');
  });

  it('rejects invalid repo name (leading dash)', async () => {
    const result = await ipc.invoke('gh:repo-create', '/repo', {
      name: '-bad', owner: 'alice', visibility: 'public', description: '', push: false,
    });

    assert.equal(result.ok, false);
    assert.ok(result.error, 'should include an error message');
    assert.equal(exec.calls.length, 0, 'should not call gh at all');
  });

  it('rejects invalid owner (leading dash)', async () => {
    const result = await ipc.invoke('gh:repo-create', '/repo', {
      name: 'myapp', owner: '-bad', visibility: 'public', description: '', push: false,
    });

    assert.equal(result.ok, false);
    assert.equal(exec.calls.length, 0, 'should not call gh at all');
  });

  it('returns ok:false on gh failure', async () => {
    exec.on('repo create', { throws: 'Repository creation failed', stderr: 'Repository creation failed: name already exists' });

    const result = await ipc.invoke('gh:repo-create', '/repo', {
      name: 'myapp', owner: 'alice', visibility: 'public', description: '', push: false,
    });

    assert.equal(result.ok, false);
    assert.ok(result.error.includes('name already exists'), `error should include stderr: ${result.error}`);
  });
});
