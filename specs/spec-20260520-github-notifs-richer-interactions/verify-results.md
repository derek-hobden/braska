# Verification results
Captured: 2026-05-20T10:05:15Z
Head commit (pre-commit): d713104eae23fcb4f41064da1714646148099b80 + working-tree changes

## $ node --test 'test/**/*.test.{js,mjs}'
exit: 0
▶ computeJourneyCards
  ✔ shows pull-remote card when pushBehind > 0 and NO dirty files (2.674208ms)
  ✔ does NOT show pull-remote card when pushBehind > 0 AND dirty files exist (0.379084ms)
  ✔ shows commit card when dirty files exist (0.177917ms)
  ✔ shows only conflicts card when conflicted files exist (1.832792ms)
  ✔ shows behind-main card when behind > 0 and clean (0.381292ms)
  ✔ shows push card when pushAhead > 0 with upstream (0.092167ms)
  ✔ shows share card for unpublished feature branch with commits (0.097792ms)
  ✔ shows post-merge card when mergeInfo is provided (0.080667ms)
  ✔ returns empty array when nothing is actionable (0.151917ms)
  ✔ diverged state — shows sync card when pushAhead > 0 and pushBehind > 0 (clean) (0.150292ms)
  ✔ diverged state — does NOT show separate pull-remote or share cards when diverged (0.07625ms)
  ✔ diverged state — dirty files still show commit card (not sync card) (0.080542ms)
✔ computeJourneyCards (7.812708ms)
▶ notifRoutingDecision
  ✔ routes Issue subjects into the panel issue detail view (1.440916ms)
  ✔ routes PullRequest subjects into the panel PR detail view (0.118167ms)
  ✔ returns external for routable type when subject.url cannot be parsed (0.067208ms)
  ✔ opens Commit externally when htmlUrl is set (0.072917ms)
  ✔ opens Discussion / Release externally when htmlUrl is set (0.067042ms)
  ✔ returns none for CheckSuite with no htmlUrl (0.056583ms)
  ✔ returns none when subject is missing entirely (0.056917ms)
✔ notifRoutingDecision (2.977792ms)
▶ notifReasonChip
  ✔ maps mention reasons (0.136458ms)
  ✔ maps review-related reasons (0.065708ms)
  ✔ maps assignment / authorship reasons (0.089791ms)
  ✔ maps ci_activity (0.059167ms)
  ✔ maps subscribed / state_change (0.050708ms)
  ✔ passes unknown reasons through with default category (1.796459ms)
  ✔ handles null/undefined reason (0.435625ms)
✔ notifReasonChip (2.924167ms)
▶ notificationSubjectToHtmlUrl
  ✔ maps Issue subject.url to github.com /issues/N (1.976333ms)
  ✔ maps PullRequest subject.url to github.com /pull/N (pulls → pull) (0.332209ms)
  ✔ maps Commit subject.url to github.com /commit/<sha> (commits → commit) (0.162083ms)
  ✔ returns null for Release subject (only API ID is known, not the tag) (0.073792ms)
  ✔ returns null for Discussion (no convertible subject URL pattern) (0.063125ms)
  ✔ returns null when subject.url is null/undefined (0.059417ms)
  ✔ returns null when subject.url is not an api.github.com URL we recognise (0.057416ms)
  ✔ passes through api.<host>-style tenants by stripping the api. prefix (0.058708ms)
✔ notificationSubjectToHtmlUrl (5.421542ms)
ℹ tests 95
ℹ suites 14
ℹ pass 95
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 397.299833

