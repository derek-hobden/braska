# Verification results
Captured: 2026-05-20T10:03:08Z
Head commit: 8ae9892ce6e922454c1da38789250a6e6873798a

## $ node --test test/*.test.js test/*.test.mjs
exit: 0
  ✔ maps Commit subject.url to github.com /commit/<sha> (commits → commit) (0.063208ms)
  ✔ returns null for Release subject (only API ID is known, not the tag) (0.054208ms)
  ✔ returns null for Discussion (no convertible subject URL pattern) (0.052167ms)
  ✔ returns null when subject.url is null/undefined (0.0555ms)
  ✔ returns null when subject.url is not an api.github.com URL we recognise (0.05625ms)
  ✔ passes through api.<host>-style tenants by stripping the api. prefix (0.052458ms)
✔ notificationSubjectToHtmlUrl (1.928042ms)
ℹ tests 81
ℹ suites 12
ℹ pass 81
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 241.725

## Manual verification (NOT scripted — see Definition of done)

This is a renderer UI polish change. The node:test suite covers main-process handlers only.
Required manual checks before marking the PR ready for review:

1. Open an issue with a markdown body — confirm headings, lists, code blocks, bold, inline code render correctly.
2. Raw URL in body — clicking opens system browser (not in-renderer).
3. Markdown link [text](url) — clicking opens system browser.
4. Multi-line comment with single-newline-separated lines — renders as two lines (breaks: true verified).
5. Comments below the issue — same rendering behavior.
6. PR body and comments — same.
7. CI runs and notifications sub-views — render correctly (no markdown rendering for plain titles, but anchor clicks still routed).
8. Relative/hash links inside a body — preventDefault'd, do not navigate the SPA.

Status: implementation complete; awaiting manual UI verification by the user.
