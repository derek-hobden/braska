# Baseline verify
Captured: 2026-05-20T09:51:30Z
Base commit: d713104eae23fcb4f41064da1714646148099b80

## $ node --test 'test/**/*.test.*js'
exit: 0
  ✔ maps Commit subject.url to github.com /commit/<sha> (commits → commit) (0.063167ms)
  ✔ returns null for Release subject (only API ID is known, not the tag) (0.05275ms)
  ✔ returns null for Discussion (no convertible subject URL pattern) (0.0525ms)
  ✔ returns null when subject.url is null/undefined (0.053875ms)
  ✔ returns null when subject.url is not an api.github.com URL we recognise (0.052667ms)
  ✔ passes through api.<host>-style tenants by stripping the api. prefix (0.051459ms)
✔ notificationSubjectToHtmlUrl (1.949084ms)
ℹ tests 81
ℹ suites 12
ℹ pass 81
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 261.996291
