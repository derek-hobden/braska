# Baseline verify — active tab memory (#42)

Run before any implementation changes. Pre-existing failures here are not regressions.

---

## Command 1: `node --test test/git-pull.test.js test/git-worktree.test.js test/journey-cards.test.mjs`

**Exit code:** 0

**Output (last 15 lines):**
```
    ok 9 - returns empty array when nothing is actionable
      ---
      duration_ms: 0.336556
      type: 'test'
      ...
    1..9
ok 4 - computeJourneyCards
  ---
  duration_ms: 6.688609
  type: 'suite'
  ...
1..4
# tests 19
# suites 3
# pass 19
# fail 0
```

**Status:** PASS — all 19 tests pass.

---

## Command 2: state check (node --input-type=module)

**Exit code:** 1

**Output:**
```
Error: activeTabByWorkDir must be a Map
```

**Status:** FAIL — expected pre-implementation failure. The `activeTabByWorkDir` field does not yet exist in `tabState`. This failure will be resolved by the implementation.

---

## Note on `npm test`

`npm test` (i.e. `node --test test/`) fails on Node v22.22.2 because the `--test` flag treats a bare directory argument as a module path rather than a glob root. This is a pre-existing configuration issue unrelated to issue #42. Individual test files pass as shown above.
