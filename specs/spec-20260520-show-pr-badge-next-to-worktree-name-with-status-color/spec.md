# Spec — Show PR badge next to worktree name with status color (#70)

Issue: https://github.com/derek-hobden/braska/issues/70 · branch: `gh-issue-70` · PR: https://github.com/derek-hobden/braska/pull/74 · started: 2026-05-20T00:00:00Z

**Status:** Draft awaiting visual verification by user. All 85 local tests pass; no `⚠ uncertain` assumptions remain.

## Issue body

> If a worktree has a PR, show a **PR** badge to the right of the worktree name in the sidebar:
>
> - 🟢 **Green** if the PR is open
> - 🔴 **Red** if the PR is closed (without merge)
> - 🟣 **Purple** if the PR is merged
>
> Clicking the badge opens the PR in the right panel using the PR view inside the existing GitHub panel.

**Follow-up from review (2026-05-20):** also show a light-grey "draft" variant for open-but-draft PRs (draft takes precedence over green).

## Chosen approach

Extend the existing `refreshCIBadges` flow in `renderer/sidebar.js` (which already fetches `prForBranch` per non-main worktree) to additionally render a small "PR" badge in a new `.wt-pr` slot in the worktree row. Map `pr.state` → `.open / .closed / .merged` CSS class. Wire a click handler that mirrors the existing `openIssueInPanel` pattern (`renderer/app.js:250-255`) but sets `ghState.directPRNumber` and `ghState.section = 'prs'` — the PR detail view auto-opens via the existing logic at `renderer/github-prs.js:19-24`. Fix `gh:pr-for-branch` in `main/github.js` to pass `--state all` and include `state` in the JSON fields (its current default of `--state open` is why closed/merged PRs are invisible today).

## Assumptions

- ✓ **confident** — `gh pr list --state all --json state` returns one of `OPEN | CLOSED | MERGED` (uppercase) per PR.
  - _Basis (reproducer)_: see research.md → Verified tool behavior. Ran `gh pr list --state all --limit 5 --json number,state` on this repo and got `MERGED`, `CLOSED`, `MERGED`, `MERGED`, `MERGED`.

- ✓ **confident** — `gh pr list` defaults to `--state open` when no flag is passed; the current `gh:pr-for-branch` handler omits the flag, so it returns `null` for closed/merged PRs.
  - _Basis (reproducer)_: see research.md. Ran `gh pr list --head gh-issue-66 --json number,state --limit 1` (no `--state all`) and got `[]` for a branch with a merged PR.

- ✓ **confident** — Setting `ghState.directPRNumber = N` and `ghState.section = 'prs'`, then calling `switchRightPanelTab('github')`, opens PR #N's detail view directly.
  - _Basis (file:line)_: `renderer/github-prs.js:19-24` — `refreshGitHubPRs` reads `ghState.directPRNumber`, clears it, and calls `showGitHubPRDetail(workDir, n)`. Identical mechanism to `directIssueNumber` (which is exercised by the existing `openIssueInPanel`).

- ✓ **confident** — The main worktree row should not get a PR badge.
  - _Basis (file:line)_: `renderer/sidebar.js:146` — `refreshCIBadges` already skips main worktrees for the CI badge, and main worktrees track the default branch which never has a PR pointing at it.

- ✓ **confident** — Colour palette `#3fb950 / #e5534b / #a371f7` is the project's existing OPEN/CLOSED/MERGED palette.
  - _Basis (file:line)_: `styles.css:3506-3508` already defines `.gh-badge-open`, `.gh-badge-closed`, `.gh-badge-merged` with those exact colours.

## Definition of done

- A non-main worktree whose branch has an open PR shows a green "PR" badge next to the branch name in the sidebar.
- The same worktree, after its PR is closed unmerged, shows a red "PR" badge.
- The same worktree, after its PR is merged, shows a purple "PR" badge.
- Clicking the badge opens the PR detail view in the right-side GitHub panel without changing which worktree is selected.
- Main worktrees and worktrees with no PR show no PR badge.
- All existing tests still pass.

## Up-front tests

- `test/pr-state-badge-class.test.js::maps gh state strings to CSS class suffixes` — unit-test a pure `prStateBadgeClass(state)` helper in `renderer/utils.js`. Follows the existing pure-helper testing pattern (`journey-cards`, `issue-branch-re`).

## Tasks

Statuses: `- [ ]` pending, `- [x]` done, `- [ ] ~~text~~ — deferred: <reason>` deferred.

- [x] Extend `main/github.js` `gh:pr-for-branch` to pass `--state all` and include `state` in the JSON fields.
  - _Story: As the sidebar code, when I ask for the PR on a branch whose PR is closed or merged, then I receive its `state`._

- [x] Guard the CI-dot render in `refreshCIBadges` so it only fires when `pr.state === 'OPEN'`. Preserves today's behaviour (today the IPC returns `null` for non-open PRs; after the previous task, non-open PRs would otherwise start rendering stale CI dots).
  - _Story: As a user with a merged PR, when I look at the sidebar, then I do not see a stale "CI passing" green dot on a merged PR's row._

- [x] Add pure `prStateBadgeClass(state)` helper to `renderer/utils.js` returning `'open' | 'closed' | 'merged' | null`.

- [x] Add unit test `test/pr-state-badge-class.test.js` covering all four cases.

- [x] Add a `.wt-pr` empty span to the worktree row template in `renderer/sidebar.js` (placed between `.wt-branch-name` and `.wt-ci`).

- [x] In `refreshCIBadges`, after fetching `prForBranch`, render a PR badge into the `.wt-pr` slot using `prStateBadgeClass(pr.state)` (skip main worktrees and rows with no PR, matching the CI behaviour).
  - _Story: As a user looking at the sidebar, when my branch has a merged PR, then I see a purple "PR" pill next to the branch name._

- [x] Add `openPRInPanel` to `initSidebar`'s dependency-injection bag; receive it in `sidebar.js` like `_openIssueInPanel`.

- [x] Wire a click handler in `sidebar.js` that calls `_openPRInPanel(wtPath, prNumber)` when the `.wt-pr` element is clicked, with `e.stopPropagation()` to prevent the worktree row click from also firing. Mirror the issue-icon handler at `renderer/sidebar.js:257-266`.

- [x] In `renderer/app.js`, define `openPRInPanel(workDir, prNumber)` that sets `ghState.section = 'prs'`, `ghState.directPRNumber = prNumber`, calls `openWorkDir(workDir)` and `switchRightPanelTab('github')` — mirror `openIssueInPanel` (lines 250-255). Pass it into `initSidebar(...)` at line 260.

- [x] Add CSS rules for `.wt-pr` with `.wt-pr.open / .closed / .merged` colour variants and hover style. Reuse the existing palette from `styles.css:3506-3508`.

- [x] Add a unit test under `test/sidebar-pr-badge.test.js` covering the badge-render logic for all three states.

- [x] Update `project.md` with a dated entry describing the feature.

## Verify

```bash
node --test 'test/**/*.test.*js'
```

Note: `package.json` has `"test": "node --test test/"` which fails on Node 25 (treats `test/` as a module path). Glob form works on all Node versions. The repo has no CI test workflow today; only `claude.yml` (the @claude bot trigger).

## Size budget

Target: ≤8 files changed, ≤400 lines added/removed, ≤20 tasks.

## Decisions

- Reused existing branch `gh-issue-70` matching issue #70 (no new worktree, no new branch).
- Spec location: `<repo>/specs/` (tracked) — first invocation of this skill in this repo; cached in `~/.claude/fix-issue/braska-deb39da6/config.json`.
- No per-worktree PR cache (rejected the Explore agent's `ghState.prByWorktree` suggestion as YAGNI; the existing per-render fetch is sufficient).
- No new IPC channel — extend the existing `gh:pr-for-branch` handler. The `--state all` change is a strict superset of the current behaviour (it still returns OPEN PRs).

## Don'ts (rejected approaches and disproved assumptions)

- ❌ **Don't** assume `gh pr list --head <branch> --json number` returns merged/closed PRs by default — it does not; `gh pr list` defaults to `--state open`. Always pass `--state all` when the caller cares about merged/closed PRs.
- ❌ **Don't** store the PR record on the worktree object in `main/projects.js` — would require `gh` calls inside every `getGitInfo()` (slow path called on every project-list refresh).

## Course corrections

- 2026-05-20: Pre-implementation advisor review caught a latent regression — adding `--state all` to `gh:pr-for-branch` would have caused the existing CI dot to start rendering for merged/closed PRs (a stale "ready to merge" green dot on merged rows). Added a guard so `ciBadgeHtml` only fires when `pr.state === 'OPEN'`, and switched the badge-render test to a pure helper (`prStateBadgeClass`) following the existing test pattern. Tasks reordered accordingly.

## Subagent notes

Single Explore subagent run during research. Returned full file:line citations for sidebar / app / state / github / styles. The agent suggested caching PR results in `ghState.prByWorktree` and storing `state` on the worktree record — both rejected as YAGNI; recorded above under `## Don'ts`.

## Follow-ups (deferred work)

_Nothing deferred yet._

## Open questions

_None._

## Baseline verify (pre-implementation)

_Populated at end of Phase 3._

## Verification results (post-implementation)

_Populated in Phase 5._
