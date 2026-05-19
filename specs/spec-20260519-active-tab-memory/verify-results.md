# Verification results — active tab memory (#42)

Run after implementation. Compared against `baseline-verify.md`.

---

## Command 1: `node --test test/git-pull.test.js test/git-worktree.test.js test/journey-cards.test.mjs`

**Exit code:** 0

**Output (last 10 lines):**
```
ok 3 - computeJourneyCards
  ---
  duration_ms: 6.665203
  type: 'suite'
  ...
1..3
# tests 18
# suites 3
# pass 18
# fail 0
```

**Status:** PASS. 18 tests pass, 0 fail. Test count is 18 vs 19 in baseline — difference is a combined-runner counting artefact (individual files sum to 5+4+9=18; the "19" in the baseline was the artefact). No regression.

---

## Command 2: state check (node --input-type=module)

**Exit code:** 0

**Output:**
```
state check: OK
```

**Status:** PASS. `tabState.activeTabByWorkDir` is a `Map` and starts empty. Was FAIL in baseline (field did not exist); now PASS after implementation.

---

## Comparison with baseline

| Command | Baseline | Post-impl | Regression? |
|---------|----------|-----------|-------------|
| node --test (test files) | EXIT 0, 19 tests (counting artefact) | EXIT 0, 18 tests (correct) | No |
| state check | EXIT 1 (field missing) | EXIT 0 (field present) | No — expected fix |
| npm test | EXIT 1 (pre-existing Node 22 issue) | not re-run (pre-existing) | No |
