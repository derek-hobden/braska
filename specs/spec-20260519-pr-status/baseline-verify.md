# Baseline verify — PR status (#56)

Run before any implementation changes. Pre-existing failures here are not regressions.

---

## Command: `node --test test/github.test.js test/git-worktree.test.js test/git-pull.test.js test/journey-cards.test.mjs`

Note: `test/github.test.js` does not yet exist (will be created during implementation). Baseline runs the three existing files only.

**Exit code:** 0

**Output (last 20 lines):**
```
ok 5 - computeJourneyCards
  ---
  duration_ms: 7.234233
  type: 'suite'
  ...
1..5
# tests 28
# suites 5
# pass 28
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 104.728813
```

**Note on `npm test` (pre-existing failure):** `npm test` runs `node --test test/` which fails with `MODULE_NOT_FOUND` on this Node.js v22 environment — a pre-existing condition unrelated to this issue. All previous routines on this repo ran individual test files directly. The Verify block uses the direct invocation pattern.
