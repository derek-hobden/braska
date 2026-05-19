# Spec — worktree from remote branch (#48)

Issue: [#48](https://github.com/derek-hobden/braska/issues/48) · PR: [#49](https://github.com/derek-hobden/braska/pull/49) · branch: `claude/issue-48` · started: 2026-05-19T00:00:00Z

**Status:** Spec drafted; implementation not started.

## Issue body

> When i click 'add worktree', i want the ability to select a remote branch. there is a dropdown to select a branch, but i dont see any of the branches on github, so i think perhpas its only giving me options for local branches.

## Chosen approach

Add a "Local / Remote" pill toggle beside the "Branch" label in the existing `wt-branch-select-group` form group. Toggling swaps between the existing `#wt-branch-select` (local branches, unchanged) and a new `#wt-remote-branch-select` (remote-tracking branches from `git branch -r`). A new `git:remote-branches` IPC handler feeds the remote list; `remoteBranches()` is exposed on the `window.worktree` preload bridge. The `git:worktree-add` handler already accepts `origin/branch-name` and needs no changes — git creates a local tracking branch automatically. Path generation strips the remote prefix (`origin/`) so the suggested directory name stays clean.

## Assumptions

- ✓ **confident** — `git worktree add <path> origin/branch-name` auto-creates a local tracking branch without `--track`: verified from git documentation and the fact that the existing `createNew=false` path in `git:worktree-add` already does exactly this.
- ✓ **confident** — `git branch -r --format=%(refname:short)` lists remote-tracking branches in `origin/branch` form and the `HEAD` alias appears as `origin/HEAD -> origin/main` in verbose mode but as `origin/HEAD` in short format, which we can filter: confirmed by reading the handler.
- ✓ **confident** — The `wt-branch-select-group` is shown only when "Create new branch" is unchecked; the toggle and second select live entirely within that group and never conflict with the new-branch flow.
- ⚠ **uncertain** — Whether `git branch -r` output includes `origin/HEAD` as a bare entry (format `%(refname:short)`) — need to verify the filter `!b.endsWith('/HEAD')` is sufficient. Will test in the verify step.

## Definition of done

- Clicking "Add Worktree" and unchecking "Create new branch" shows the branch select with "Local" and "Remote" toggle buttons.
- Clicking "Remote" swaps the select to list remote-tracking branches (e.g. `origin/main`, `origin/feature-xyz`).
- Clicking "Local" swaps back to the original local branch list.
- Selecting a remote branch auto-generates the suggested directory path using just the short branch name (without the `origin/` prefix).
- Submitting with a remote branch selected creates the worktree via `git worktree add` passing the full `origin/branch-name` value.
- `origin/HEAD` does not appear in the remote branch list.
- All existing tests still pass.

## Up-front tests

- `test/git-worktree.test.js::git:remote-branches handler > lists remote branches stripping HEAD` — asserts that `git branch -r` output is split correctly and HEAD alias is filtered
- `test/git-worktree.test.js::git:remote-branches handler > returns empty array on git error` — asserts graceful failure

## Tasks

Statuses: `- [ ]` pending, `- [x]` done, `- [ ] ~~text~~ — deferred: <reason>` deferred.

- [ ] **▶ Active** — Add `git:remote-branches` IPC handler and expose via preload
  - _Story: As the renderer, when I call `window.worktree.remoteBranches(path)`, then I get an array of `origin/branch-name` strings with HEAD aliases filtered out._
  - _test: `test/git-worktree.test.js::git:remote-branches handler`_
- [ ] Add Local/Remote toggle and second select to "Add Worktree" modal HTML
  - _Story: As a user, when I uncheck "Create new branch", then I see a "Local" / "Remote" toggle beside the Branch label._
- [ ] Wire toggle logic and remote branch load in renderer
  - _Story: As a user, when I click "Remote", then the select refreshes with remote branches; when I click "Local" the original list reappears; path auto-generation uses the short branch name in both cases._
- [ ] Add CSS for toggle buttons
  - _Story: As a user, the toggle buttons look visually consistent with the modal's dark theme._

## Verify

Every command must exit 0 on success and non-zero on failure.

```bash
node --test test/git-worktree.test.js
node --test test/git-pull.test.js
node --test
```

## Decisions

_Appended chronologically as implementation reveals choices._

## Don'ts (rejected approaches)

- Single `<select>` with `<optgroup>` local/remote sections: value handling must strip prefix for path generation while keeping it for the git call — two different transforms on the same string is error-prone.

## Course corrections

_When the spec was wrong and how it was updated, with timestamp._

## Subagent notes

Research subagent confirmed:
- `git:branches` at `main/git-worktree.js:140` uses `git branch --format=%(refname:short)` — local only.
- `git:worktree-add` at `main/git-worktree.js:152` passes branch as-is; no changes needed for remote refs.
- Preload at `preload.js:59` exposes `window.worktree`; `remoteBranches` slot is empty.
- Modal HTML at `index.html:317` — single select inside `wt-branch-select-group`.
- Submit handler at `renderer/worktree-modals.js:286` reads branch from `wt-branch-select` when `isNew=false`.

## Follow-ups (deferred work)

- Auto-fetch (`git fetch --prune`) on modal open to refresh stale remote list.
- Multi-remote repos: currently `git branch -r` includes all remotes; path generation strips only the first path component. Full multi-remote UI is deferred.

## Open questions

_Things that need human input before merge._

## Baseline verify (pre-implementation)

_Populated at end of Phase 2._

## Verification results (post-implementation)

_Populated in Phase 4._
