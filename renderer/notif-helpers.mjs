// Pure helpers for the GitHub notifications panel.
// Imported by renderer/github-panel.js and exercised by test/notif-helpers.test.mjs.

const SUBJECT_NUMBER_RE = /\/(?:issues|pulls)\/(\d+)\/?$/;

export function notifRoutingDecision(n) {
  const subject = (n && n.subject) || null;
  if (!subject || !subject.type) return { kind: 'none' };

  const url = subject.url || '';
  const m = url.match(SUBJECT_NUMBER_RE);
  if (subject.type === 'Issue' && m) {
    return { kind: 'panel-issue', number: parseInt(m[1], 10) };
  }
  if (subject.type === 'PullRequest' && m) {
    return { kind: 'panel-pr', number: parseInt(m[1], 10) };
  }
  if (n && n.htmlUrl) return { kind: 'external', url: n.htmlUrl };
  return { kind: 'none' };
}

// Maps GitHub's notification `reason` to a short display label + a category
// used as a CSS class suffix (gh-notif-chip-<category>). Unknown reasons
// pass through with snake_case → space-case label and category 'default'.
const REASON_TABLE = {
  mention:           { label: 'mention',      category: 'mention' },
  team_mention:      { label: 'team mention', category: 'mention' },
  review_requested:  { label: 'review',       category: 'review' },
  assign:            { label: 'assigned',     category: 'assigned' },
  author:            { label: 'author',       category: 'author' },
  ci_activity:       { label: 'CI',           category: 'ci' },
  subscribed:        { label: 'subscribed',   category: 'subscribed' },
  state_change:      { label: 'state',        category: 'state' },
  comment:           { label: 'comment',      category: 'comment' },
  manual:            { label: 'manual',       category: 'default' },
  invitation:        { label: 'invitation',   category: 'default' },
  security_alert:    { label: 'security',     category: 'security' },
};

export function notifReasonChip(reason) {
  if (!reason) return { label: '', category: 'default' };
  if (REASON_TABLE[reason]) return REASON_TABLE[reason];
  return { label: reason.replace(/_/g, ' '), category: 'default' };
}
