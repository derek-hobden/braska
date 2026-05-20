# Baseline verify
Captured: 2026-05-20T08:36:00Z
Base commit: 06a379b1562caa88681564934ffe3346b82a7fcc

## $ node --test test/*.test.js test/*.test.mjs
exit: 0
▶ ISSUE_BRANCH_RE
  ✔ matches gh-issue-N (original UI-created format) (0.602916ms)
  ✔ matches claude/issue-N (agent-created format) (0.111667ms)
  ✔ matches bare issue-N (0.067709ms)
  ✔ extracts the correct number (0.056833ms)
  ✔ does not match main (0.051541ms)
  ✔ does not match a plain feature branch (0.048459ms)
✔ ISSUE_BRANCH_RE (1.723208ms)
▶ computeJourneyCards
  ✔ shows pull-remote card when pushBehind > 0 and NO dirty files (0.767209ms)
  ✔ does NOT show pull-remote card when pushBehind > 0 AND dirty files exist (0.081125ms)
  ✔ shows commit card when dirty files exist (0.064208ms)
  ✔ shows only conflicts card when conflicted files exist (0.771667ms)
  ✔ shows behind-main card when behind > 0 and clean (0.071416ms)
  ✔ shows push card when pushAhead > 0 with upstream (0.06275ms)
  ✔ shows share card for unpublished feature branch with commits (0.065666ms)
  ✔ shows post-merge card when mergeInfo is provided (0.073042ms)
  ✔ returns empty array when nothing is actionable (0.089292ms)
  ✔ diverged state — shows sync card when pushAhead > 0 and pushBehind > 0 (clean) (0.1195ms)
  ✔ diverged state — does NOT show separate pull-remote or share cards when diverged (0.065292ms)
  ✔ diverged state — dirty files still show commit card (not sync card) (0.072333ms)
✔ computeJourneyCards (3.560709ms)
ℹ tests 68
ℹ suites 11
ℹ pass 68
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 233.723709

