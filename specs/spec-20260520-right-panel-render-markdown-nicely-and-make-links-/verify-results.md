# Verification results
Captured: 2026-05-20T09:55:33Z
Head commit: d713104eae23fcb4f41064da1714646148099b80

## $ node --test test/*.test.js test/*.test.mjs
exit: 0
  ✔ does NOT show pull-remote card when pushBehind > 0 AND dirty files exist (0.085708ms)
  ✔ shows commit card when dirty files exist (0.06775ms)
  ✔ shows only conflicts card when conflicted files exist (0.865791ms)
  ✔ shows behind-main card when behind > 0 and clean (0.089875ms)
  ✔ shows push card when pushAhead > 0 with upstream (0.116417ms)
  ✔ shows share card for unpublished feature branch with commits (0.101042ms)
  ✔ shows post-merge card when mergeInfo is provided (0.095ms)
  ✔ returns empty array when nothing is actionable (0.105167ms)
  ✔ diverged state — shows sync card when pushAhead > 0 and pushBehind > 0 (clean) (0.20725ms)
  ✔ diverged state — does NOT show separate pull-remote or share cards when diverged (0.085875ms)
  ✔ diverged state — dirty files still show commit card (not sync card) (0.106834ms)
✔ computeJourneyCards (4.675208ms)
▶ notificationSubjectToHtmlUrl
  ✔ maps Issue subject.url to github.com /issues/N (0.696875ms)
  ✔ maps PullRequest subject.url to github.com /pull/N (pulls → pull) (0.12825ms)
  ✔ maps Commit subject.url to github.com /commit/<sha> (commits → commit) (0.062292ms)
  ✔ returns null for Release subject (only API ID is known, not the tag) (0.060417ms)
  ✔ returns null for Discussion (no convertible subject URL pattern) (0.052375ms)
  ✔ returns null when subject.url is null/undefined (0.050375ms)
  ✔ returns null when subject.url is not an api.github.com URL we recognise (0.050166ms)
  ✔ passes through api.<host>-style tenants by stripping the api. prefix (0.051333ms)
✔ notificationSubjectToHtmlUrl (1.971875ms)
ℹ tests 81
ℹ suites 12
ℹ pass 81
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 252.822792

## Manual verification (NOT scripted — see Definition of done)

This is a renderer UI polish change. The node:test suite covers main-process handlers only and cannot verify the new rendering. Manual verification by launching the app and exercising the GitHub right panel is required:

1. Open an issue with a markdown body — confirm headings, lists, code blocks, bold, and inline code render as styled HTML (not raw text).
2. Click a raw URL in the body — opens in the system browser, not in the app window.
3. Click a markdown-style link in the body — opens in the system browser.
4. Open an issue with comments — same checks for each comment.
5. Open a PR — same checks for body and comments.
6. Open the CI runs and notifications sub-views — verify they still render correctly (no markdown rendering for their plain titles).

Status: implementation complete; awaiting manual UI verification by the user.
