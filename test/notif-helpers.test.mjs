import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { notifRoutingDecision, notifReasonChip } from '../renderer/notif-helpers.mjs';

describe('notifRoutingDecision', () => {
  // Subjects whose detail view exists in the panel route inline; subjects
  // without an inline detail open externally (when htmlUrl exists) or are
  // un-clickable (when htmlUrl is null).

  it('routes Issue subjects into the panel issue detail view', () => {
    const n = {
      subject: { type: 'Issue', url: 'https://api.github.com/repos/o/r/issues/42' },
      htmlUrl: 'https://github.com/o/r/issues/42',
    };
    assert.deepEqual(notifRoutingDecision(n), { kind: 'panel-issue', number: 42 });
  });

  it('routes PullRequest subjects into the panel PR detail view', () => {
    const n = {
      subject: { type: 'PullRequest', url: 'https://api.github.com/repos/o/r/pulls/7' },
      htmlUrl: 'https://github.com/o/r/pull/7',
    };
    assert.deepEqual(notifRoutingDecision(n), { kind: 'panel-pr', number: 7 });
  });

  it('returns external for routable type when subject.url cannot be parsed', () => {
    const n = {
      subject: { type: 'Issue', url: null },
      htmlUrl: 'https://github.com/o/r/issues/99',
    };
    assert.deepEqual(notifRoutingDecision(n), { kind: 'external', url: 'https://github.com/o/r/issues/99' });
  });

  it('opens Commit externally when htmlUrl is set', () => {
    const n = {
      subject: { type: 'Commit', url: 'https://api.github.com/repos/o/r/commits/abc' },
      htmlUrl: 'https://github.com/o/r/commit/abc',
    };
    assert.deepEqual(notifRoutingDecision(n), { kind: 'external', url: 'https://github.com/o/r/commit/abc' });
  });

  it('opens Discussion / Release externally when htmlUrl is set', () => {
    const a = { subject: { type: 'Discussion' }, htmlUrl: 'https://github.com/o/r/discussions/1' };
    assert.deepEqual(notifRoutingDecision(a), { kind: 'external', url: 'https://github.com/o/r/discussions/1' });
    const b = { subject: { type: 'Release' }, htmlUrl: 'https://github.com/o/r/releases/tag/v1' };
    assert.deepEqual(notifRoutingDecision(b), { kind: 'external', url: 'https://github.com/o/r/releases/tag/v1' });
  });

  it('returns none for CheckSuite with no htmlUrl', () => {
    const n = { subject: { type: 'CheckSuite', url: null }, htmlUrl: null };
    assert.deepEqual(notifRoutingDecision(n), { kind: 'none' });
  });

  it('returns none when subject is missing entirely', () => {
    assert.deepEqual(notifRoutingDecision({}), { kind: 'none' });
    assert.deepEqual(notifRoutingDecision({ subject: {} }), { kind: 'none' });
  });
});

describe('notifReasonChip', () => {
  // Maps GitHub's `reason` enum to short display labels + a category that
  // CSS uses for color tinting. Unknown reasons pass through with category
  // 'default'.

  it('maps mention reasons', () => {
    assert.deepEqual(notifReasonChip('mention'), { label: 'mention', category: 'mention' });
    assert.deepEqual(notifReasonChip('team_mention'), { label: 'team mention', category: 'mention' });
  });

  it('maps review-related reasons', () => {
    assert.deepEqual(notifReasonChip('review_requested'), { label: 'review', category: 'review' });
  });

  it('maps assignment / authorship reasons', () => {
    assert.deepEqual(notifReasonChip('assign'), { label: 'assigned', category: 'assigned' });
    assert.deepEqual(notifReasonChip('author'), { label: 'author', category: 'author' });
  });

  it('maps ci_activity', () => {
    assert.deepEqual(notifReasonChip('ci_activity'), { label: 'CI', category: 'ci' });
  });

  it('maps subscribed / state_change', () => {
    assert.deepEqual(notifReasonChip('subscribed'), { label: 'subscribed', category: 'subscribed' });
    assert.deepEqual(notifReasonChip('state_change'), { label: 'state', category: 'state' });
  });

  it('passes unknown reasons through with default category', () => {
    assert.deepEqual(notifReasonChip('weird_new_reason'), { label: 'weird new reason', category: 'default' });
  });

  it('handles null/undefined reason', () => {
    assert.deepEqual(notifReasonChip(null), { label: '', category: 'default' });
    assert.deepEqual(notifReasonChip(undefined), { label: '', category: 'default' });
    assert.deepEqual(notifReasonChip(''), { label: '', category: 'default' });
  });
});
