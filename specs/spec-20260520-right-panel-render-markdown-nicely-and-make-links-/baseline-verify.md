# Baseline verify
Captured: 2026-05-20T09:52:55Z
Base commit: d713104eae23fcb4f41064da1714646148099b80

## $ node --test test/*.test.js test/*.test.mjs
exit: 0
  ✔ does NOT show pull-remote card when pushBehind > 0 AND dirty files exist (0.085209ms)
  ✔ shows commit card when dirty files exist (0.067ms)
  ✔ shows only conflicts card when conflicted files exist (0.842166ms)
  ✔ shows behind-main card when behind > 0 and clean (0.079292ms)
  ✔ shows push card when pushAhead > 0 with upstream (0.065084ms)
  ✔ shows share card for unpublished feature branch with commits (0.063459ms)
  ✔ shows post-merge card when mergeInfo is provided (0.072125ms)
  ✔ returns empty array when nothing is actionable (0.08475ms)
  ✔ diverged state — shows sync card when pushAhead > 0 and pushBehind > 0 (clean) (0.123458ms)
  ✔ diverged state — does NOT show separate pull-remote or share cards when diverged (0.067709ms)
  ✔ diverged state — dirty files still show commit card (not sync card) (0.068125ms)
✔ computeJourneyCards (3.315875ms)
▶ notificationSubjectToHtmlUrl
  ✔ maps Issue subject.url to github.com /issues/N (0.716833ms)
  ✔ maps PullRequest subject.url to github.com /pull/N (pulls → pull) (0.122625ms)
  ✔ maps Commit subject.url to github.com /commit/<sha> (commits → commit) (0.0645ms)
  ✔ returns null for Release subject (only API ID is known, not the tag) (0.05375ms)
  ✔ returns null for Discussion (no convertible subject URL pattern) (0.051125ms)
  ✔ returns null when subject.url is null/undefined (0.053708ms)
  ✔ returns null when subject.url is not an api.github.com URL we recognise (0.050542ms)
  ✔ passes through api.<host>-style tenants by stripping the api. prefix (0.051083ms)
✔ notificationSubjectToHtmlUrl (2.015083ms)
ℹ tests 81
ℹ suites 12
ℹ pass 81
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 247.512875

