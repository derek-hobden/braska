# Spec — issue → worktree linking (#55)

Issue: [#55](https://github.com/derek-hobden/braska/issues/55) · PR: [#58](https://github.com/derek-hobden/braska/pull/58) · branch: `claude/issue-55` · started: 2026-05-19T18:30:00Z

**Status:** Complete. All verify commands passed.

## Issue body

> we set up a system previously where if the worktree name matched the issue number then the icon to the left would be the issue icon and be clickable. well now sometimes the issue is called something like claude/issue-46. need a solution for this

## Chosen approach

Update `ISSUE_BRANCH_RE` in `main/projects.js` (line 41) from `/^gh-issue-(\d+)$/` to `/^(?:[\w.-]+\/)?(?:gh-)?issue-(\d+)$/`. This regex still anchors at start and end, adds an optional `<prefix>/` segment to accommodate `claude/issue-N` style branches, and keeps the optional `gh-` infix for the existing `gh-issue-N` format. The existing design already accepts the explicit JSON map (`.the-agency/worktree-issues.json`) as the authoritative source of truth — the regex is a zero-config fallback — so widening it is a low-risk, minimal change consistent with the codebase's stated intent.

## Assumptions

- ✓ **confident** — `ISSUE_BRANCH_RE` is the only place in `main/projects.js` where the branch-to-issue regex heuristic is applied.
  - _Basis (file:line)_: `main/projects.js:85` — single `wt.branch.match(ISSUE_BRANCH_RE)` call in the `getGitInfo` loop; no other uses of the constant.

- ✓ **confident** — The regex `/^(?:[\w.-]+\/)?(?:gh-)?issue-(\d+)$/` correctly matches `gh-issue-46`, `claude/issue-46`, `issue-46` and does not match `main`.
  - _Basis (reproducer)_: see research.md → Verified tool behavior → "Regex match verification"
  - Observed output: `gh-issue-46 46 / claude/issue-46 46 / issue-46 46 / main undefined`

- ✓ **confident** — Explicit JSON entries in `worktree-issues.json` take precedence over the regex fallback, so widening the regex cannot break existing explicit links.
  - _Basis (file:line)_: `main/projects.js:80-84` — `if (explicit && Number.isInteger(explicit.issue)) { wt.githubIssue = explicit.issue; continue; }` — `continue` skips the regex check.

- ✓ **confident** — `npm test` as written has a pre-existing failure in this environment; tests must be run as `node --test test/*.test.js test/*.test.mjs`.
  - _Basis (reproducer)_: see research.md → Verified tool behavior → "Test suite verification"

## Definition of done

- A worktree on branch `claude/issue-46` shows the issue icon in the sidebar and navigates to the linked issue when clicked.
- The `ISSUE_BRANCH_RE` regex constant in `main/projects.js` matches `claude/issue-N` style branches.
- A unit test covers the new regex cases.
- All 18 existing tests still pass.

## Up-front tests

- `test/issue-branch-re.test.js::matches gh-issue-N` — existing format still resolves
- `test/issue-branch-re.test.js::matches claude/issue-N` — new agent format resolves
- `test/issue-branch-re.test.js::matches bare issue-N` — minimal format resolves
- `test/issue-branch-re.test.js::does not match main` — non-issue branch ignored
- `test/issue-branch-re.test.js::does not match feature-branch` — arbitrary branch ignored

## Tasks

- [x] Add unit tests for `ISSUE_BRANCH_RE` covering the new branch formats
  - _Story: As a developer, when I run the test suite, then tests assert the regex matches `gh-issue-N`, `claude/issue-N`, `issue-N` and rejects `main` and plain feature branches._
  - _test: `test/issue-branch-re.test.js`_
- [x] Update `ISSUE_BRANCH_RE` in `main/projects.js` to match `claude/issue-N` style branches
  - _Story: As a user, when I have a worktree on branch `claude/issue-46`, then the sidebar shows the issue icon and it's clickable._
  - _test: `test/issue-branch-re.test.js::matches claude/issue-N`_

## Verify

```bash
node --test test/issue-branch-re.test.js test/git-worktree.test.js test/git-pull.test.js test/journey-cards.test.mjs
```

## Decisions

_Appended chronologically as implementation reveals choices._

## Don'ts (rejected approaches and disproved assumptions)

_Nothing recorded yet._

## Course corrections

_Nothing recorded yet._

## Subagent notes

Research subagent confirmed: regex change is single-line, pre-existing `npm test` failure is environment-level (Node `--test` directory mode), all 18 individual tests pass. No tests for `ISSUE_BRANCH_RE` exist today.

## Follow-ups (deferred work)

_Nothing deferred yet._

## Open questions

_None._

## Baseline verify (pre-implementation)

_Populated at end of Phase 2._

## Verification results (post-implementation)

_Populated in Phase 4._
