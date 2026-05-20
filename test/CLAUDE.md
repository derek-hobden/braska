## Purpose
Automated test suite run with `node --test`. Tests cover main-process IPC handlers (CJS) and pure renderer utility functions (ESM `.mjs`). Run individual files directly — `node --test test/` has a pre-existing directory-resolution bug and does not work.

## Contents
- `helpers.js` — test utilities: `mockExec`, `installMocks`, `loadModule`, `mockIpcMain` for main-process handler tests
- `git-pull.test.js` — tests for the `git:pull` IPC handler in `main/git-ops.js`
- `git-worktree.test.js` — tests for the `git:pull-latest-main` IPC handler in `main/git-worktree.js`
- `journey-cards.test.mjs` — tests for `computeJourneyCards` pure function in `renderer/journey-cards.mjs`
