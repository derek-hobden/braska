const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { notificationSubjectToHtmlUrl } = require('../main/github');

describe('notificationSubjectToHtmlUrl', () => {
  it('maps Issue subject.url to github.com /issues/N', () => {
    const out = notificationSubjectToHtmlUrl(
      'https://api.github.com/repos/octocat/Hello-World/issues/123',
      'Issue',
    );
    assert.equal(out, 'https://github.com/octocat/Hello-World/issues/123');
  });

  it('maps PullRequest subject.url to github.com /pull/N (pulls → pull)', () => {
    const out = notificationSubjectToHtmlUrl(
      'https://api.github.com/repos/octocat/Hello-World/pulls/42',
      'PullRequest',
    );
    assert.equal(out, 'https://github.com/octocat/Hello-World/pull/42');
  });

  it('maps Commit subject.url to github.com /commit/<sha> (commits → commit)', () => {
    const out = notificationSubjectToHtmlUrl(
      'https://api.github.com/repos/octocat/Hello-World/commits/abc123def',
      'Commit',
    );
    assert.equal(out, 'https://github.com/octocat/Hello-World/commit/abc123def');
  });

  it('returns null for Release subject (only API ID is known, not the tag)', () => {
    const out = notificationSubjectToHtmlUrl(
      'https://api.github.com/repos/octocat/Hello-World/releases/9876',
      'Release',
    );
    assert.equal(out, null);
  });

  it('returns null for Discussion (no convertible subject URL pattern)', () => {
    const out = notificationSubjectToHtmlUrl(null, 'Discussion');
    assert.equal(out, null);
  });

  it('returns null when subject.url is null/undefined', () => {
    assert.equal(notificationSubjectToHtmlUrl(null, 'Issue'), null);
    assert.equal(notificationSubjectToHtmlUrl(undefined, 'PullRequest'), null);
  });

  it('returns null when subject.url is not an api.github.com URL we recognise', () => {
    assert.equal(
      notificationSubjectToHtmlUrl('https://example.com/foo/bar', 'Issue'),
      null,
    );
    assert.equal(
      notificationSubjectToHtmlUrl(
        'https://api.github.com/repos/octocat/Hello-World/something-unknown/1',
        'Issue',
      ),
      null,
    );
  });

  // Only api.<host>-style URLs match (api.github.com and GHE Cloud tenants like
  // api.<tenant>.ghe.com). GHE Server (uses <host>/api/v3/repos/...) is not covered;
  // those rows skip the icon via the null fallback.
  it('passes through api.<host>-style tenants by stripping the api. prefix', () => {
    const out = notificationSubjectToHtmlUrl(
      'https://api.github.acme.corp/repos/team/proj/issues/7',
      'Issue',
    );
    assert.equal(out, 'https://github.acme.corp/team/proj/issues/7');
  });
});
