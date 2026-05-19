# Baseline Verify — pre-implementation

Run on branch `claude/issue-26` before any implementation changes.

## Command 1: Tests

```
node --test test/git-pull.test.js test/git-worktree.test.js test/journey-cards.test.mjs
```

**Exit code:** 0

**Output (last 10 lines):**
```
1..3
# tests 18
# suites 3
# pass 18
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 106.468071
```

## Command 2: refreshChanges in github-prs.js

```
grep -n "refreshChanges" renderer/github-prs.js
```

**Exit code:** 1 (no match — expected; this confirms the gap being fixed)

**Output:** (empty)

## Command 3: refreshChanges in initGitHubPRs call

```
grep -n "refreshChanges" renderer/app.js | grep "initGitHubPRs"
```

**Exit code:** 1 (no match — expected; this confirms the injection is missing)

**Output:** (empty)

## Notes

- `npm test` (which runs `node --test test/`) fails pre-existing in this environment with "Cannot find module '/home/user/braska/test'" — Node 22 directory-glob behaviour issue. Individual test files pass. Spec Verify block updated to use individual file invocations.
- Commands 2 and 3 exit 1 at baseline — this is the expected pre-fix state, not a regression. After implementation they must exit 0 (match found).
