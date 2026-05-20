# Research — issue → worktree linking (#55)

## Problem summary

`ISSUE_BRANCH_RE` in `main/projects.js` (line 41) is currently `/^gh-issue-(\d+)$/`, which only auto-links worktrees whose branch names match exactly the pattern `gh-issue-<N>`. The "Work on this in a new worktree" button in the GitHub Issues panel (`renderer/github-issues.js` line 317) generates branches in exactly that format — but the Claude CLI, when autonomously creating worktrees, produces branch names in the form `claude/issue-<N>` (a slash-separated prefix style). These branches never match the existing regex, so the worktree's sidebar entry never gets the issue-link icon or the automatic `githubIssue` property, breaking the worktree↔issue association for agent-created worktrees.

## Approaches considered

### 1. Update `ISSUE_BRANCH_RE` to a broader regex (proposed fix)

Change the constant to `/^(?:[\w.-]+\/)?(?:gh-)?issue-(\d+)$/` so it matches an optional `<prefix>/` segment and optionally the `gh-` infix, while still anchoring to `issue-<digits>` at the end.

**Pros:** Single-line change; zero new dependencies; works for both existing `gh-issue-N` branches and agent-generated `claude/issue-N` branches; still strict enough to avoid collisions with most normal branch names.

**Cons:** Also matches `feature/gh-issue-46` style names (unusual in practice). Also matches bare `issue-46`.

**Precedent:** The existing regex is already described in a code comment as a convenience fallback for "CLI-created worktrees" (comment at line 73–75 of `main/projects.js`), so widening the pattern is consistent with existing design intent.

### 2. Require explicit linking only (JSON map, no regex fallback)

Remove the regex fallback entirely; require the agent or user to call `worktree:link-issue` to store a JSON record in `.the-agency/worktree-issues.json`.

**Pros:** No false positives; linking semantics are unambiguous.

**Cons:** Breaks the existing zero-friction path for `gh-issue-N` branches. Agent-created worktrees would silently get no issue link unless explicitly calling the link IPC.

### 3. Have the Claude agent call `worktree:link-issue` after creating the worktree

Document/require any agent-based worktree creation flow to call the link IPC.

**Pros:** Precise; works for any branch name format.

**Cons:** Requires coordinating every agent script; fragile — any agent not following the protocol silently breaks the feature. Does not fix already-created worktrees.

### 4. Scan `.the-agency/worktree-issues.json` in reverse (look up by issue number)

Query the JSON map for all branch-to-issue entries for lookup instead of using regex.

**Pros:** Fully explicit.

**Cons:** Only works for entries that were explicitly written. Doesn't solve zero-friction auto-detection from branch names. Adds complexity without solving the root cause.

## Recommended approach

**Approach 1** — update `ISSUE_BRANCH_RE` to `/^(?:[\w.-]+\/)?(?:gh-)?issue-(\d+)$/`.

Consistent with the existing design principle: the regex is explicitly described as a convenience fallback for "CLI-created worktrees". The codebase already accepts the trade-off that explicit JSON entries win and the regex is a zero-config fallback. Widening the pattern is a minimal, localized change that makes the fallback match the actual naming conventions produced by the Claude CLI without requiring any change to agent behavior. Single line in `main/projects.js` line 41.

## Verified tool behavior

### Regex match verification

**Claim:** `/^(?:[\w.-]+\/)?(?:gh-)?issue-(\d+)$/` matches `gh-issue-46`, `claude/issue-46`, `issue-46` and does not match `main`.

**Reproducer:**
```
node -e "const RE=/^(?:[\w.-]+\/)?(?:gh-)?issue-(\d+)$/; ['gh-issue-46','claude/issue-46','issue-46','main','feature/gh-issue-46','feat/issue-123'].forEach(b=>console.log(b, RE.exec(b)?.[1]))"
```

**Observed output:**
```
gh-issue-46 46
claude/issue-46 46
issue-46 46
main undefined
feature/gh-issue-46 46
feat/issue-123 123
```

**Verdict:** Claim holds for the primary cases (`gh-issue-46`, `claude/issue-46`, `issue-46` match; `main` does not). Also matches `feature/gh-issue-46` and `feat/issue-123` which are edge cases; since explicit JSON entries always win over the regex, a spurious regex match is low-risk.

**Implication for recommended approach:** No change to the recommendation. The false-positive cases are unusual branch names and the impact (spurious issue icon) is minor and overridable via the JSON map.

### Test suite verification

**Claim:** Running `npm test` executes all tests and they pass.

**Reproducer:** `cd /home/user/braska && npm test 2>&1 | tail -30`

**Observed output:**
```
Error: Cannot find module '/home/user/braska/test'
...
not ok 1 - test
# tests 1
# pass 0
# fail 1
```

**Verdict:** `npm test` has a pre-existing failure in this environment — Node.js `--test` directory mode fails with `MODULE_NOT_FOUND`. Running individual test files directly shows all 18 tests pass:

```
node --test /home/user/braska/test/*.test.js /home/user/braska/test/*.test.mjs
# tests 18
# pass 18
# fail 0
```

**Implication:** The `npm test` script is broken pre-change. The Verify block will use the glob form that works.

## Unknowns

- Whether `feature/gh-issue-46` false-positive matching is considered acceptable. Given that explicit JSON entries win, the risk is low.
- No tests exist for `ISSUE_BRANCH_RE` or `getGitInfo`'s issue-linking logic. Tests should be added as part of this fix.

## Files inventory

- `main/projects.js` — contains `ISSUE_BRANCH_RE` (line 41) and `getGitInfo`; primary fix location.
- `main/git-worktree.js` — handles `worktree:link-issue` / `worktree:unlink-issue` IPC; confirms two-track linking strategy (explicit JSON + regex fallback).
- `renderer/sidebar.js` — renders `wt-icon-issue` class and `data-gh-issue` attribute using the `githubIssue` property; confirms the visual effect of the fix.
- `renderer/github-issues.js` — `createWorktreeFromIssue` creates `gh-issue-<N>` branches (line 317) and calls `linkIssue` as belt-and-suspenders.
- `test/helpers.js` — mock infrastructure; confirms no existing tests cover issue-branch regex logic.
- `test/git-worktree.test.js` — existing tests for `git:pull-latest-main`; all 18 tests pass; no issue-linking coverage.
