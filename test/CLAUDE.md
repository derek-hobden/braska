## Purpose
`node --test` unit tests for main-process modules. Run with `node --test test/*.test.js test/*.test.mjs`. Tests use mock infrastructure from `helpers.js` to isolate handlers from real git/filesystem.

## Contents
- `helpers.js` — mock factories: `mockExec`, `installMocks`, `loadModule`, `mockIpcMain`
- `git-pull.test.js` — tests for `git:pull` IPC handler
- `git-worktree.test.js` — tests for `git:pull-latest-main` IPC handler
- `issue-branch-re.test.js` — tests for `ISSUE_BRANCH_RE` branch-name → issue-number heuristic
- `journey-cards.test.mjs` — tests for `computeJourneyCards` pure function (renderer module)
