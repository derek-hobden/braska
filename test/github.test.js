const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { mockExec, installMocks, loadModule, mockIpcMain } = require('./helpers');

describe('prCheckStatus', async () => {
  const { prCheckStatus } = await import('../renderer/utils.js');

  it('returns null for null rollup', () => {
    assert.equal(prCheckStatus(null), null);
  });

  it('returns null for empty rollup', () => {
    assert.equal(prCheckStatus([]), null);
  });

  it('returns null for undefined rollup', () => {
    assert.equal(prCheckStatus(undefined), null);
  });

  it('returns pass when all CheckRuns succeeded', () => {
    const rollup = [
      { __typename: 'CheckRun', conclusion: 'SUCCESS', status: 'COMPLETED' },
      { __typename: 'CheckRun', conclusion: 'NEUTRAL', status: 'COMPLETED' },
    ];
    assert.equal(prCheckStatus(rollup), 'pass');
  });

  it('returns fail on FAILURE conclusion', () => {
    const rollup = [
      { __typename: 'CheckRun', conclusion: 'SUCCESS', status: 'COMPLETED' },
      { __typename: 'CheckRun', conclusion: 'FAILURE', status: 'COMPLETED' },
    ];
    assert.equal(prCheckStatus(rollup), 'fail');
  });

  it('returns fail on ERROR conclusion', () => {
    const rollup = [
      { __typename: 'CheckRun', conclusion: 'ERROR', status: 'COMPLETED' },
    ];
    assert.equal(prCheckStatus(rollup), 'fail');
  });

  it('returns fail on TIMED_OUT conclusion', () => {
    const rollup = [
      { __typename: 'CheckRun', conclusion: 'TIMED_OUT', status: 'COMPLETED' },
    ];
    assert.equal(prCheckStatus(rollup), 'fail');
  });

  it('returns pending when a CheckRun has no conclusion (in progress)', () => {
    const rollup = [
      { __typename: 'CheckRun', conclusion: null, status: 'IN_PROGRESS' },
      { __typename: 'CheckRun', conclusion: 'SUCCESS', status: 'COMPLETED' },
    ];
    assert.equal(prCheckStatus(rollup), 'pending');
  });

  it('returns pending when a CheckRun status is QUEUED', () => {
    const rollup = [
      { __typename: 'CheckRun', conclusion: null, status: 'QUEUED' },
    ];
    assert.equal(prCheckStatus(rollup), 'pending');
  });

  it('returns pass for StatusContext with state SUCCESS (regression for ghChecksBadge bug)', () => {
    const rollup = [
      { __typename: 'StatusContext', state: 'SUCCESS' },
    ];
    assert.equal(prCheckStatus(rollup), 'pass');
  });

  it('returns fail for StatusContext with state FAILURE', () => {
    const rollup = [
      { __typename: 'StatusContext', state: 'FAILURE' },
    ];
    assert.equal(prCheckStatus(rollup), 'fail');
  });

  it('returns fail for StatusContext with state ERROR', () => {
    const rollup = [
      { __typename: 'StatusContext', state: 'ERROR' },
    ];
    assert.equal(prCheckStatus(rollup), 'fail');
  });

  it('returns pending for StatusContext with state PENDING', () => {
    const rollup = [
      { __typename: 'StatusContext', state: 'PENDING' },
    ];
    assert.equal(prCheckStatus(rollup), 'pending');
  });

  it('fail takes priority over pending', () => {
    const rollup = [
      { __typename: 'CheckRun', conclusion: null, status: 'IN_PROGRESS' },
      { __typename: 'CheckRun', conclusion: 'FAILURE', status: 'COMPLETED' },
    ];
    assert.equal(prCheckStatus(rollup), 'fail');
  });

  it('mixed CheckRun and StatusContext — all passing', () => {
    const rollup = [
      { __typename: 'CheckRun', conclusion: 'SUCCESS', status: 'COMPLETED' },
      { __typename: 'StatusContext', state: 'SUCCESS' },
    ];
    assert.equal(prCheckStatus(rollup), 'pass');
  });
});

describe('gh:pr-for-branch handler', () => {
  let exec, ipc;

  function setup() {
    exec = mockExec();
    installMocks(exec);
    const { register } = loadModule('../main/github');
    ipc = mockIpcMain();
    register({ ipcMain: ipc });
  }

  it('includes statusCheckRollup in the gh invocation', async () => {
    setup();
    exec.on('symbolic-ref', { stdout: 'feature-x\n' });
    exec.on('pr list', { stdout: JSON.stringify([{ number: 7, url: 'https://github.com/x/y/pull/7', statusCheckRollup: [] }]) });

    const result = await ipc.invoke('gh:pr-for-branch', '/repo');

    assert.ok(result.ok);
    assert.ok(result.pr);
    assert.equal(result.pr.number, 7);
    const ghCall = exec.calls.find(c => c.cmd === 'gh' && c.args.includes('pr'));
    assert.ok(ghCall, 'gh should have been called');
    const jsonFlagIdx = ghCall.args.indexOf('--json');
    assert.ok(jsonFlagIdx >= 0, '--json flag should be present');
    assert.ok(ghCall.args[jsonFlagIdx + 1].includes('statusCheckRollup'), '--json should include statusCheckRollup');
  });

  it('returns pr: null when no PR exists for branch', async () => {
    setup();
    exec.on('symbolic-ref', { stdout: 'feature-x\n' });
    exec.on('pr list', { stdout: JSON.stringify([]) });

    const result = await ipc.invoke('gh:pr-for-branch', '/repo');

    assert.ok(result.ok);
    assert.equal(result.pr, null);
  });

  it('returns pr: null when gh fails', async () => {
    setup();
    exec.on('symbolic-ref', { stdout: 'feature-x\n' });
    exec.on('pr list', { throws: 'not authenticated' });

    const result = await ipc.invoke('gh:pr-for-branch', '/repo');

    assert.ok(result.ok);
    assert.equal(result.pr, null);
  });
});
