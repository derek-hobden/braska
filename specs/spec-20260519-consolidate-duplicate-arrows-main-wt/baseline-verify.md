# Baseline verify — consolidate duplicate ⇣N arrows on main worktree row (#64)

Run before any implementation changes. Pre-existing failures are not regressions.

---

## Command: `node --test test/git-pull.test.js test/git-worktree.test.js test/gh-auth-accounts.test.js test/gh-repo-create.test.js test/journey-cards.test.mjs`

**Exit code:** 0

**Output (last 15 lines):**
```
    ok 4 - handles dirty files on main branch same as feature branches
      ---
      duration_ms: 0.549491
      type: 'test'
      ...
    1..4
ok 6 - git:pull-latest-main handler
  ---
  duration_ms: 3.546025
  type: 'suite'
  ...
1..6
# tests 29
# suites 6
# pass 29
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 231.254816
```

**Status:** PASS — all 29 tests pass.

---

## Note on `npm test`

`npm test` (i.e. `node --test test/`) fails on Node v22.22.2 because the `--test` flag treats a bare directory argument as a module path rather than a glob root. Pre-existing issue unrelated to this PR; individual test files pass as shown above.
