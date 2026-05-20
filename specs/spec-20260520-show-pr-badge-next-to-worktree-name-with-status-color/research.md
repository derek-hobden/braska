# Research — PR badge on worktree row (#70)

## Problem summary

Each non-main worktree row in the sidebar should show a small "PR" badge next to the
branch name, coloured by PR state: green=OPEN, red=CLOSED (unmerged), purple=MERGED.
Clicking the badge opens the PR's detail view in the right-side GitHub panel without
unselecting the worktree.

## Approaches considered

1. **Extend `refreshCIBadges` in `renderer/sidebar.js`** to render a second badge into a
   new `.wt-pr` slot, reusing the existing `prForBranch` call. Add `openPRInPanel` to
   the sidebar's dep-injection — same shape as the existing `openIssueInPanel`. Extend
   the IPC to include `state` and `--state all`. **Chosen.**
2. **Cache PR data in `ghState.prByWorktree`** as the Explore agent originally suggested.
   Rejected — YAGNI. The current code re-fetches per badge refresh and that's fine. Caching
   would add invalidation complexity (when a PR is created/merged elsewhere).
3. **Store PR fields on the worktree record in `main/projects.js`.** Rejected — same as (2),
   plus it'd require teaching `getGitInfo()` to call `gh` for every worktree on every
   project-list refresh, slowing it down significantly.

## Recommended approach

Approach (1). Minimal code, mirrors the existing `openIssueInPanel` /
`directIssueNumber` pattern symmetrically, and one IPC fix (`--state all` + `state`
field) is required regardless.

## Verified tool behavior

### `gh pr list` `--state` default is `open`, NOT `all`

```bash
$ gh pr list --head gh-issue-66 --json number,state --limit 1
[]
$ gh pr list --head gh-issue-66 --state all --json number,state --limit 1
[{"number":72,"state":"MERGED"}]
```

The current `main/github.js:128-138` handler passes no `--state` flag, so it returns
`null` for closed and merged PRs today. The new feature relies on receiving merged
and closed PRs, so the handler must add `--state all`.

### `state` field values

```bash
$ gh pr list --state all --limit 5 --json number,state,title
[{"number":72,"state":"MERGED",...},
 {"number":69,"state":"CLOSED",...},
 {"number":67,"state":"MERGED",...},
 {"number":65,"state":"MERGED",...},
 {"number":63,"state":"MERGED",...}]
```

Confirmed: `gh pr list --json state` returns one of `OPEN | CLOSED | MERGED` (uppercase).

## Files inventory

- `renderer/sidebar.js` — worktree row render at line 46; `refreshCIBadges` at line 141-154
  fetches PR via `window.github.prForBranch` and skips the main worktree (line 146);
  `initSidebar` destructures deps at line 192; existing issue-icon click handler at
  lines 257-266 is the template to follow for the PR badge click.
- `renderer/app.js` — `openIssueInPanel` at lines 250-255 (template to clone for
  `openPRInPanel`); `initSidebar` invocation at line 260.
- `renderer/state.js` — `ghState.directPRNumber` already exists at line 75.
- `renderer/github-prs.js:19-24` — `refreshGitHubPRs` already consumes `directPRNumber`
  to skip the list and jump straight to the PR detail view. No new render code needed.
- `main/github.js:128-138` — `gh:pr-for-branch` handler; needs `state` added to JSON
  fields AND `--state all` added.
- `styles.css:3506-3508` — existing `.gh-badge-open/closed/merged` colours
  (`#3fb950`, `#e5534b`, `#a371f7`). New `.wt-pr` styles will reuse these colour values.
- `preload.js:123` — `window.github.prForBranch` already exposed.

## Unknowns

None — design is fully grounded in the codebase.
