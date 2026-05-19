// Tests for ISSUE_BRANCH_RE — branch-name → GitHub issue number heuristic.
// Covers the original gh-issue-N format and the claude/issue-N format added in #55.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { ISSUE_BRANCH_RE } = require('../main/projects');

describe('ISSUE_BRANCH_RE', () => {
  function match(branch) {
    const m = branch.match(ISSUE_BRANCH_RE);
    return m ? parseInt(m[1], 10) : null;
  }

  it('matches gh-issue-N (original UI-created format)', () => {
    assert.equal(match('gh-issue-46'), 46);
  });

  it('matches claude/issue-N (agent-created format)', () => {
    assert.equal(match('claude/issue-46'), 46);
  });

  it('matches bare issue-N', () => {
    assert.equal(match('issue-46'), 46);
  });

  it('extracts the correct number', () => {
    assert.equal(match('gh-issue-123'), 123);
    assert.equal(match('claude/issue-7'), 7);
  });

  it('does not match main', () => {
    assert.equal(match('main'), null);
  });

  it('does not match a plain feature branch', () => {
    assert.equal(match('feat/add-dark-mode'), null);
    assert.equal(match('fix-typo'), null);
  });
});
