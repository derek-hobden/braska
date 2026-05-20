# Baseline verify — github notifications dot (#61)

Run before any implementation changes. Pre-existing failures here are not regressions.

Note: `npm test` (`node --test test/`) has a pre-existing failure (directory argument not handled correctly by this Node version). The actual test suite is run directly.

---

## Command 1: `node --test test/git-pull.test.js test/git-worktree.test.js test/gh-auth-accounts.test.js test/gh-repo-create.test.js test/journey-cards.test.mjs`

**Exit code:** 0

**Output (last 20 lines):**
```
    ok 12 - diverged state — dirty files still show commit card (not sync card)
      ---
      duration_ms: 0.280365
      type: 'test'
      ...
    1..12
ok 7 - computeJourneyCards
  ---
  duration_ms: 8.415278
  type: 'suite'
  ...
1..7
# tests 41
# suites 7
# pass 41
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 218.113352
```
