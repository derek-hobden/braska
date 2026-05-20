# Verification results
Captured: 2026-05-20T09:56:25Z
Head commit (working tree): pre-commit

## $ node --test 'test/**/*.test.*js'
exit: 0
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /Users/derek/repos/braska.worktrees/gh-issue-70/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
✔ prStateBadgeClass maps OPEN to "open" (1.598417ms)
✔ prStateBadgeClass maps CLOSED to "closed" (0.099208ms)
✔ prStateBadgeClass maps MERGED to "merged" (0.06275ms)
✔ prStateBadgeClass returns null for unknown / missing state (0.061291ms)
ℹ tests 85
ℹ suites 12
ℹ pass 85
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 270.412916
