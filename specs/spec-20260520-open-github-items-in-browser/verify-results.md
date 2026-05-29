# Verification results
Captured: 2026-05-20T08:41:36Z
Head commit: 06a379b1562caa88681564934ffe3346b82a7fcc

## $ node --test test/*.test.js test/*.test.mjs
exit: 0
▶ ISSUE_BRANCH_RE
  ✔ matches gh-issue-N (original UI-created format) (0.617959ms)
  ✔ matches claude/issue-N (agent-created format) (0.121208ms)
  ✔ matches bare issue-N (0.06525ms)
  ✔ extracts the correct number (0.057125ms)
  ✔ does not match main (0.052792ms)
  ✔ does not match a plain feature branch (0.0495ms)
✔ ISSUE_BRANCH_RE (1.755959ms)
▶ computeJourneyCards
  ✔ shows pull-remote card when pushBehind > 0 and NO dirty files (0.796417ms)
  ✔ does NOT show pull-remote card when pushBehind > 0 AND dirty files exist (0.088042ms)
  ✔ shows commit card when dirty files exist (0.069125ms)
  ✔ shows only conflicts card when conflicted files exist (0.818916ms)
  ✔ shows behind-main card when behind > 0 and clean (0.07675ms)
  ✔ shows push card when pushAhead > 0 with upstream (0.065083ms)
  ✔ shows share card for unpublished feature branch with commits (0.063416ms)
  ✔ shows post-merge card when mergeInfo is provided (0.067625ms)
  ✔ returns empty array when nothing is actionable (0.090416ms)
  ✔ diverged state — shows sync card when pushAhead > 0 and pushBehind > 0 (clean) (0.126708ms)
  ✔ diverged state — does NOT show separate pull-remote or share cards when diverged (0.069917ms)
  ✔ diverged state — dirty files still show commit card (not sync card) (0.798125ms)
✔ computeJourneyCards (4.103375ms)
▶ notificationSubjectToHtmlUrl
  ✔ maps Issue subject.url to github.com /issues/N (0.707417ms)
  ✔ maps PullRequest subject.url to github.com /pull/N (pulls → pull) (0.140459ms)
  ✔ maps Commit subject.url to github.com /commit/<sha> (commits → commit) (0.073875ms)
  ✔ returns null for Release subject (only API ID is known, not the tag) (0.054292ms)
  ✔ returns null for Discussion (no convertible subject URL pattern) (0.051541ms)
  ✔ returns null when subject.url is null/undefined (0.053459ms)
  ✔ returns null when subject.url is not an api.github.com URL we recognise (0.05125ms)
  ✔ passes through enterprise GHE hosts (api.<host> → <host>) (0.049791ms)
✔ notificationSubjectToHtmlUrl (2.005375ms)
ℹ tests 76
ℹ suites 12
ℹ pass 76
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 249.835375

