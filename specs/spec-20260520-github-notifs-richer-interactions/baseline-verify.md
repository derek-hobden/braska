# Baseline verify
Captured: 2026-05-20T09:57:36Z
Base commit: d713104eae23fcb4f41064da1714646148099b80

## $ node --test 'test/**/*.test.{js,mjs}'
exit: 0
  ✔ conflict takes priority over passing checks (0.124333ms)
  ✔ returns pass when no checks but PR is mergeable and not draft (0.049292ms)
  ✔ returns null when no checks but PR is draft (0.04125ms)
  ✔ returns null when no checks and mergeability is unknown (0.034708ms)
✔ prCheckStatus (7.285083ms)
▶ gh:pr-for-branch handler
  ✔ includes statusCheckRollup in the gh invocation (2.651042ms)
  ✔ returns pr: null when no PR exists for branch (0.232625ms)
  ✔ returns pr: null when gh fails (0.295667ms)
✔ gh:pr-for-branch handler (3.252958ms)
▶ ISSUE_BRANCH_RE
  ✔ matches gh-issue-N (original UI-created format) (0.616917ms)
  ✔ matches claude/issue-N (agent-created format) (0.129083ms)
  ✔ matches bare issue-N (0.062334ms)
  ✔ extracts the correct number (0.056ms)
  ✔ does not match main (0.05225ms)
  ✔ does not match a plain feature branch (0.049291ms)
✔ ISSUE_BRANCH_RE (1.735125ms)
▶ computeJourneyCards
  ✔ shows pull-remote card when pushBehind > 0 and NO dirty files (0.786583ms)
  ✔ does NOT show pull-remote card when pushBehind > 0 AND dirty files exist (0.08625ms)
  ✔ shows commit card when dirty files exist (0.080833ms)
  ✔ shows only conflicts card when conflicted files exist (0.846875ms)
  ✔ shows behind-main card when behind > 0 and clean (0.073042ms)
  ✔ shows push card when pushAhead > 0 with upstream (0.06125ms)
  ✔ shows share card for unpublished feature branch with commits (0.064209ms)
  ✔ shows post-merge card when mergeInfo is provided (0.068292ms)
  ✔ returns empty array when nothing is actionable (0.088542ms)
  ✔ diverged state — shows sync card when pushAhead > 0 and pushBehind > 0 (clean) (0.127208ms)
  ✔ diverged state — does NOT show separate pull-remote or share cards when diverged (0.066917ms)
  ✔ diverged state — dirty files still show commit card (not sync card) (0.069ms)
✔ computeJourneyCards (3.358667ms)
▶ notificationSubjectToHtmlUrl
  ✔ maps Issue subject.url to github.com /issues/N (0.716458ms)
  ✔ maps PullRequest subject.url to github.com /pull/N (pulls → pull) (0.133291ms)
  ✔ maps Commit subject.url to github.com /commit/<sha> (commits → commit) (0.065167ms)
  ✔ returns null for Release subject (only API ID is known, not the tag) (0.055583ms)
  ✔ returns null for Discussion (no convertible subject URL pattern) (0.050125ms)
  ✔ returns null when subject.url is null/undefined (0.051042ms)
  ✔ returns null when subject.url is not an api.github.com URL we recognise (0.053083ms)
  ✔ passes through api.<host>-style tenants by stripping the api. prefix (0.051459ms)
✔ notificationSubjectToHtmlUrl (2.0885ms)
ℹ tests 81
ℹ suites 12
ℹ pass 81
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 254.925166

