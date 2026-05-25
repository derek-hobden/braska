# Spec — visual worktree hierarchy (#80)

Issue: [#80](https://github.com/derek-hobden/braska/issues/80) · PR: [#81](https://github.com/derek-hobden/braska/pull/81) · branch: `claude/issue-80` · started: 2026-05-25T07:30:00Z

**Status:** Spec drafted; implementation not started.

## Issue body

> In the project panel on the left I would like to show the worktrees as a visual tree so that I know which worktrees were branched from which other worktrees. by default most worktrees will come off main, so we can indent them under main. but if other worktrees are branched from a different worktree, i would like to see the grouped and further indented under the relevant worktree. this way i can easily see 'where' a worktree will merge into once i merge.

## Chosen approach

Use `git reflog show <branch> --format=%gs` to find the `branch: Created from <parent>` line for each worktree's branch. This is the only approach that correctly records the original creation parent even after the parent branch has received new commits (merge-base/ancestry approach was reproducibly disproved: the parent stops being an ancestor once it advances). The `parentBranch` field is added to each worktree object in `getGitInfo()` via `Promise.all` for parallelism (~30ms for 6 branches), then `renderer/sidebar.js` uses a pure tree-building function to compute depth before generating HTML, and CSS `data-depth` attribute selectors control the left-padding indentation. No new IPC channels or preload APIs are needed.

## Assumptions

- ✓ **confident** — `git reflog show <branch> --format=%gs` contains a `branch: Created from <parent>` line that names the branch that was current when `<branch>` was created.
  - _Basis (reproducer)_: see research.md → Verified tool behavior → "Claim 1"
  - _Inline_: `git reflog show sub-feature --format="%gs" | grep "^branch: Created from"` → `branch: Created from feature-a`

- ✓ **confident** — The `Created from` reflog entry remains accurate after the parent branch advances past the branch point.
  - _Basis (reproducer)_: see research.md → Verified tool behavior → "Claim 2"

- ✓ **confident** — `git worktree add -b <branch> <path> <startpoint>` (what braska uses) produces a `Created from <startpoint>` reflog entry automatically; no metadata write needed.
  - _Basis (reproducer)_: see research.md → Verified tool behavior → "Claim 4"

- ✓ **confident** — Six parallel reflog calls add ≤30ms to `getGitInfo()`.
  - _Basis (reproducer)_: see research.md → Verified tool behavior → "Claim 6" — 29ms sequentially; `Promise.all` collapses to ~one-call latency.

- ✓ **confident** — `git worktree list --porcelain` has no parent information; reflog calls are mandatory.
  - _Basis (reproducer)_: see research.md → Verified tool behavior → "Claim 7"

- ✓ **confident** — The main worktree's branch has no `branch: Created from` reflog entry; its absence is the correct "root" signal.
  - _Basis (reproducer)_: see research.md → Verified tool behavior → "Claim 5"

- ✓ **confident** — `parentBranch` added to worktree objects in `getGitInfo()` flows to the renderer automatically through the existing `projects:list` → `window.projects.list()` pipeline with no preload or IPC changes.
  - _Basis (file:line)_: `main/projects.js:108` — `Promise.all(projects.map(async p => ({ ...p, ...(await getGitInfo(p.path)) })))` returns the full worktrees array including any new fields.

- ✓ **confident** — `.worktree-item` base left padding is 44px; indent steps of 12px are visually readable at the sidebar's font size.
  - _Basis (file:line)_: `styles.css:145` — `padding: 3px 16px 3px 44px`.

- ✓ **confident** — The renderer module system is ESM; a new `renderer/worktree-tree.js` export can be imported with a relative path and is testable via `.mjs` test file without DOM.
  - _Basis (file:line)_: `renderer/sidebar.js:1` — `import { ... } from './utils.js'` (ESM); `test/journey-cards.test.mjs` exists as precedent for testing ESM renderer helpers without DOM.

- ⚠ **uncertain** — When `core.logAllRefUpdates = false`, reflog returns no output and `parentBranch` is `null`. The graceful degradation (flat list) is assumed acceptable but this config's prevalence in users' repos is unknown.
  - _What I know_: `false` is not the default; enterprise repos sometimes set it.
  - _Why uncertain_: would need a repo with that config to reproduce.
  - _Impact_: degrades gracefully to flat list — not a regression, so this does not block the PR from going out of draft.

## Definition of done

- Opening a project with multiple worktrees shows them indented under their parent branch in the project panel.
- A worktree branched directly from `main` is shown at depth 1 (indented 12px more than root).
- A worktree branched from another feature branch is shown at depth 2 or greater (further indented).
- Worktrees whose parent branch has no corresponding worktree (or no reflog entry) fall back to depth 0 (same visual level as before).
- The "Add worktree" button and all existing click handlers continue to work without change.
- All existing tests still pass.

## Up-front tests

- `test/projects-parent-branch.test.js::adds parentBranch from reflog` — asserts `getGitInfo` sets `parentBranch: 'main'` on a feature branch whose reflog says `branch: Created from main`
- `test/projects-parent-branch.test.js::treats HEAD as null` — asserts `parentBranch: null` when reflog says `branch: Created from HEAD`
- `test/projects-parent-branch.test.js::null when no Created from line` — asserts `parentBranch: null` for the main branch (no reflog entry)
- `test/worktree-tree.test.mjs::flat list with no parentBranch` — all worktrees at depth 0
- `test/worktree-tree.test.mjs::child under parent` — worktree with `parentBranch: 'main'` and matching parent in list → depth 1
- `test/worktree-tree.test.mjs::grandchild depth 2` — chain of three: main→feat→sub-feat → depths 0,1,2
- `test/worktree-tree.test.mjs::unknown parent falls back to root` — parentBranch set to a branch not in the worktree list → depth 0
- `test/worktree-tree.test.mjs::detached HEAD not linked as parent` — worktree with branch '(detached)' is never matched as a parent

## Tasks

Statuses: `- [ ]` pending, `- [x]` done, `- [ ] ~~text~~ — deferred: <reason>` deferred.

- [x] **▶ Active** — Extract `buildWorktreeTree` to `renderer/worktree-tree.js` and write its tests
  - _Story: As a test suite, when I import `buildWorktreeTree` from a DOM-free module, then I can assert the ordering and depth logic without needing a browser._
  - _test: `test/worktree-tree.test.mjs` (all cases above)_

- [ ] — Add `parentBranch` to `getGitInfo()` in `main/projects.js` and write its tests
  - _Story: As the sidebar, when I receive worktrees from `window.projects.list()`, then each worktree has a `parentBranch` field set from git reflog or null._
  - _test: `test/projects-parent-branch.test.js` (all cases above)_

- [ ] — Update `renderProjects` in `renderer/sidebar.js` to use `buildWorktreeTree` and emit `data-depth`
  - _Story: As a user, when I expand a project with nested branches, then the child worktrees are visually indented under their parent._
  - _test: visual (no automated test for DOM rendering; covered by the unit tests above)_

- [ ] — Add `data-depth` CSS to `styles.css`
  - _Story: As a user, I can see depth 1 items indented by 12px more than depth 0, depth 2 by 24px more, etc._
  - _test: visual; depth attribute is set correctly by task 3_

## Verify

```bash
node --test test/*.js test/*.mjs
```

## Decisions

_Appended chronologically as implementation reveals choices._

## Don'ts (rejected approaches and disproved assumptions)

- **Ancestry/merge-base approach is wrong.** The obvious "find which worktree branch is an ancestor of mine" approach fails as soon as the parent branch gets new commits. Reproducer: after `feature-a` got one new commit, `git merge-base --is-ancestor feature-a sub-feature` exits non-zero ("NOT ancestor"), even though `sub-feature` was branched from it. See research.md Verified tool behavior Claim 3.

## Course corrections

_When the spec was wrong and how it was updated, with timestamp._

## Subagent notes

Research subagent ran all reproducers in `/tmp/wt-hierarchy-test/`. Key results: reflog approach confirmed reliable; ancestry approach confirmed broken after parent advances; 6 sequential reflog calls took 29ms. See `research.md` for full reproducer output.

## Follow-ups (deferred work)

_None._

## Open questions

_None._

## Baseline verify (pre-implementation)

_Populated at end of Phase 2._

## Verification results (post-implementation)

_Populated in Phase 4._
