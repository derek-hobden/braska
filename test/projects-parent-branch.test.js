// Tests for getGitInfo() parentBranch enrichment via git reflog.

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { mockExec, installMocks, loadModule } = require('./helpers');

// Two-worktree porcelain output: main + feat
const TWO_WT_PORCELAIN = [
  'worktree /repo',
  'HEAD aaabbbccc',
  'branch refs/heads/main',
  '',
  'worktree /repo-feat',
  'HEAD dddeeefff',
  'branch refs/heads/feat',
  '',
].join('\n');

describe('getGitInfo parentBranch', () => {
  let exec;
  let getGitInfo;

  beforeEach(() => {
    exec = mockExec();
    installMocks(exec);
    // installMocks also puts a mock projects entry in cache; loadModule removes it
    // and loads the real projects.js (which picks up the mocked main/utils).
    ({ getGitInfo } = loadModule('../main/projects'));
  });

  it('sets parentBranch from reflog Created-from line', async () => {
    exec.on('worktree list', { stdout: TWO_WT_PORCELAIN });
    exec.on('remote get-url', { stdout: 'https://github.com/user/repo.git\n' });
    // main has no Created from entry
    exec.on('reflog show main', { stdout: 'Branch: renamed refs/heads/master to refs/heads/main\ncommit (initial): init\n' });
    // feat was branched from main
    exec.on('reflog show feat', { stdout: 'branch: Created from main\ncommit: add feat file\n' });

    const result = await getGitInfo('/repo');

    const mainWt = result.worktrees.find(w => w.branch === 'main');
    const featWt = result.worktrees.find(w => w.branch === 'feat');
    assert.equal(mainWt.parentBranch, null, 'main should have no parent');
    assert.equal(featWt.parentBranch, 'main', 'feat should have main as parent');
  });

  it('treats "HEAD" as null parentBranch (detached-HEAD creation)', async () => {
    exec.on('worktree list', { stdout: TWO_WT_PORCELAIN });
    exec.on('remote get-url', { stdout: '' });
    exec.on('reflog show main', { stdout: '' });
    exec.on('reflog show feat', { stdout: 'branch: Created from HEAD\n' });

    const result = await getGitInfo('/repo');
    const featWt = result.worktrees.find(w => w.branch === 'feat');
    assert.equal(featWt.parentBranch, null, 'HEAD parent should be normalised to null');
  });

  it('returns null when reflog has no Created-from line', async () => {
    exec.on('worktree list', { stdout: TWO_WT_PORCELAIN });
    exec.on('remote get-url', { stdout: '' });
    // Both reflogs are empty / have no Created from line
    exec.on('reflog show', { stdout: 'commit: some work\n' });

    const result = await getGitInfo('/repo');
    for (const wt of result.worktrees) {
      assert.equal(wt.parentBranch, null, `${wt.branch} should have null parentBranch`);
    }
  });

  it('returns null when reflog command fails', async () => {
    exec.on('worktree list', { stdout: TWO_WT_PORCELAIN });
    exec.on('remote get-url', { stdout: '' });
    exec.on('reflog show', { throws: 'fatal: no such ref' });

    const result = await getGitInfo('/repo');
    for (const wt of result.worktrees) {
      assert.equal(wt.parentBranch, null);
    }
  });

  it('skips parentBranch lookup for detached-HEAD worktrees', async () => {
    const detachedPorcelain = [
      'worktree /repo',
      'HEAD aaabbbccc',
      'branch refs/heads/main',
      '',
      'worktree /repo-detached',
      'HEAD dddeeefff',
      'detached',
      '',
    ].join('\n');

    exec.on('worktree list', { stdout: detachedPorcelain });
    exec.on('remote get-url', { stdout: '' });
    exec.on('reflog show main', { stdout: '' });
    // No reflog call expected for the detached worktree

    const result = await getGitInfo('/repo');
    const detached = result.worktrees.find(w => w.branch === '(detached)');
    assert.ok(detached, 'detached worktree should be present');
    assert.equal(detached.parentBranch, null);
  });
});
