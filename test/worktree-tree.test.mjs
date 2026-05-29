import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorktreeTree } from '../renderer/worktree-tree.js';

describe('buildWorktreeTree', () => {
  it('flat list with no parentBranch — all at depth 0', () => {
    const wts = [
      { branch: 'main', isMain: true },
      { branch: 'feat-a' },
      { branch: 'feat-b' },
    ];
    const result = buildWorktreeTree(wts);
    assert.equal(result.length, 3);
    for (const { depth } of result) assert.equal(depth, 0);
  });

  it('child under parent — parent depth 0, child depth 1', () => {
    const wts = [
      { branch: 'main', isMain: true },
      { branch: 'feat', parentBranch: 'main' },
    ];
    const result = buildWorktreeTree(wts);
    assert.equal(result.length, 2);
    const mainRow = result.find(r => r.wt.branch === 'main');
    const featRow = result.find(r => r.wt.branch === 'feat');
    assert.equal(mainRow.depth, 0);
    assert.equal(featRow.depth, 1);
    // parent must appear before child in the ordering
    assert.ok(result.indexOf(mainRow) < result.indexOf(featRow));
  });

  it('grandchild — main depth 0, feat depth 1, sub-feat depth 2', () => {
    const wts = [
      { branch: 'main', isMain: true },
      { branch: 'feat', parentBranch: 'main' },
      { branch: 'sub-feat', parentBranch: 'feat' },
    ];
    const result = buildWorktreeTree(wts);
    assert.equal(result.find(r => r.wt.branch === 'main').depth, 0);
    assert.equal(result.find(r => r.wt.branch === 'feat').depth, 1);
    assert.equal(result.find(r => r.wt.branch === 'sub-feat').depth, 2);
  });

  it('unknown parent falls back to root (depth 0)', () => {
    const wts = [
      { branch: 'main', isMain: true },
      { branch: 'feat', parentBranch: 'some-other-branch-not-in-list' },
    ];
    const result = buildWorktreeTree(wts);
    assert.equal(result.find(r => r.wt.branch === 'feat').depth, 0);
  });

  it('null parentBranch treated as root', () => {
    const wts = [
      { branch: 'main', parentBranch: null },
      { branch: 'feat', parentBranch: null },
    ];
    const result = buildWorktreeTree(wts);
    for (const { depth } of result) assert.equal(depth, 0);
  });

  it('detached HEAD worktree is not matched as a parent', () => {
    const wts = [
      { branch: 'main', isMain: true },
      { branch: '(detached)', parentBranch: null },
      { branch: 'feat', parentBranch: '(detached)' },
    ];
    const result = buildWorktreeTree(wts);
    // feat's parentBranch is '(detached)' but we exclude detached from the branch map
    // so feat falls back to depth 0
    assert.equal(result.find(r => r.wt.branch === 'feat').depth, 0);
  });

  it('preserves all worktrees in output even if some have no branch', () => {
    const wts = [
      { branch: 'main' },
      { branch: undefined }, // malformed entry
    ];
    const result = buildWorktreeTree(wts);
    assert.equal(result.length, 2);
  });

  it('parent comes before its children in the output order', () => {
    const wts = [
      { branch: 'feat', parentBranch: 'main' }, // listed before parent
      { branch: 'main', isMain: true },
    ];
    const result = buildWorktreeTree(wts);
    const mainIdx = result.findIndex(r => r.wt.branch === 'main');
    const featIdx = result.findIndex(r => r.wt.branch === 'feat');
    assert.ok(mainIdx < featIdx, 'main must appear before feat');
  });
});
