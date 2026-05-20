# Research — PR status (#56)

## Problem summary

The sidebar's worktree list renders each branch as a row with a `.wt-metrics` span showing git divergence badges (changed files, commits ahead/behind, unpushed). Issue #56 asks for an additional visual indicator — a green tick or red X — in that row showing whether the PR's CI checks are passing or failing. No such indicator exists today; the `gh:pr-for-branch` IPC handler only returns `{ number, url }`, discarding `statusCheckRollup`.

## Approaches considered

**A. Extend `gh:pr-for-branch` + inject into `refreshWorktreeMetrics`**

Add `statusCheckRollup` to the existing `gh:pr-for-branch` IPC response, then call that handler per-worktree from `refreshWorktreeMetrics` and render the indicator into the `.wt-metrics` span alongside existing badges.

- Pros: Minimal new surface area; follows the exact pattern already used for worktree metrics; no new IPC channel; `window.github.prForBranch` is already exposed in preload.
- Cons: `refreshWorktreeMetrics` currently only shells to `git`; adding `gh` calls makes it fail silently on unauthenticated machines (acceptable — existing try/catch pattern handles this).

**B. New dedicated IPC handler `gh:pr-check-status`**

Add a narrowly-scoped handler that returns only `{ status: 'pass'|'fail'|'pending'|null }`, and call it from `refreshWorktreeMetrics`.

- Pros: Clean separation of concerns; easy to mock.
- Cons: Adds a new IPC channel and preload bridge for something that is a trimmed version of the already-extendable `gh:pr-for-branch`; YAGNI per the project's stated principles (two callers is not the threshold for extraction).

**C. Fetch `gh pr list` for the whole project at once and scatter results**

After `loadProjects`, call `gh:pr-list` (which already fetches `statusCheckRollup` for all open PRs) and match each PR's `headRefName` to its worktree row.

- Pros: One `gh` call per project instead of one per worktree.
- Cons: Couples sidebar refresh to the full PR list timing (heavy); forces `gh` auth on every `loadProjects` call; the PR list is paginated to 50 — a project could have more.

**D. Push model (main process polls, pushes IPC events to renderer)**

Have the main process poll `gh pr list --json statusCheckRollup` on a timer and push updates via IPC events.

- Pros: Decouples rendering latency.
- Cons: Significant new complexity; not consistent with any existing pull pattern in the sidebar; `refreshWorktreeMetrics` is already driven by `git:fetched` every ~5 minutes.

## Recommended approach

**Approach A** — extend `gh:pr-for-branch` to include `statusCheckRollup`; call it from `refreshWorktreeMetrics` for each non-main worktree; render a CI badge in `.wt-metrics`.

Reasons:
1. `statusCheckRollup` is a valid `gh pr list` JSON field already used in `gh:pr-list` (`main/github.js:94`) and `gh:pr-view` (`main/github.js:105`).
2. `refreshWorktreeMetrics` is the assembly point for all per-worktree badges — the CI icon belongs here.
3. `window.github.prForBranch` is already exposed in `preload.js:122`; no preload change needed.
4. The existing try/catch-swallow pattern in `refreshWorktreeMetrics` makes the `gh` call silently skip on unauthenticated machines.
5. Refresh cadence (~5 min via `git:fetched`) is appropriate for CI status.

Concrete changes required:
- `main/github.js`: add `statusCheckRollup` to the `--json` argument of the `gh:pr-for-branch` handler.
- `renderer/utils.js`: add a `prCheckStatus(rollup)` function that correctly handles both `CheckRun` and `StatusContext` items.
- `renderer/sidebar.js`: after building git metric badges, fire `window.github.prForBranch(m.path)` for non-main worktrees; if a PR exists and has `statusCheckRollup`, append a CI badge span.
- `styles.css`: add `.wt-metric.ci-pass`, `.wt-metric.ci-fail`, `.wt-metric.ci-pending` color rules.

## Verified tool behavior

**gh CLI not installed in this environment.** All verification is code-internal.

---

**Claim 1:** `statusCheckRollup` is a valid JSON field for `gh pr list`.

- **Reproducer:** `grep -n statusCheckRollup /home/user/braska/main/github.js`
- **Observed output:** Lines 94 and 105 — the field is already in the `--json` argument of `gh:pr-list` and `gh:pr-view` handlers.
- **Verdict:** Claim holds by code-internal evidence.
- **Implication:** The `gh:pr-for-branch` handler can safely add `statusCheckRollup` to its `--json` field list.

---

**Claim 2:** `statusCheckRollup` items returned by `gh pr list` have `__typename: 'CheckRun'` (with `conclusion` in uppercase) or `__typename: 'StatusContext'` (with `state` in uppercase).

- **Reproducer:** Code analysis of `renderer/github-panel.js:29-31` and `renderer/github-prs.js` which already process this data in production.
- **Observed output:** `rollup.some(c => c.conclusion === 'FAILURE')` and `c.conclusion === 'SUCCESS'` (uppercase) are the consistently used patterns.
- **Verdict:** Claim holds by code-internal evidence.
- **Implication:** New `prCheckStatus` function must use uppercase enum strings.

---

**Claim 3:** The existing `ghChecksBadge` in `renderer/github-panel.js` incorrectly classifies a `StatusContext` item with `state === 'SUCCESS'` as "pending" (because `!c.conclusion` is `true` for StatusContext items which have no `conclusion` field).

- **Reproducer (simulated):**
  ```js
  // github-panel.js:30
  const pending = rollup.some(c => !c.conclusion || ...);
  // For { __typename: 'StatusContext', state: 'SUCCESS' }: !c.conclusion = !undefined = true → pending
  ```
- **Verdict:** Claim holds — this is a latent bug in the existing function.
- **Implication:** The sidebar implementation should use a new `prCheckStatus` function in `utils.js` that checks `__typename` to distinguish the two item types, rather than copying `ghChecksBadge` verbatim.

---

**Claim 4:** `refreshWorktreeMetrics` is called every ~5 minutes via `git:fetched`.

- **Reproducer:** `renderer/app.js:230-235` — `window.gitOps.onFetched(() => { ... refreshWorktreeMetrics(); ... })`.
- **Verdict:** Claim holds.
- **Implication:** No additional polling infrastructure needed.

## Unknowns

- Whether `statusCheckRollup` is `null` vs `[]` when a PR has no CI configured — the `prCheckStatus` function handles both (returns `null` for falsy/empty rollup).
- Whether `gh pr list --head <branch> --limit 1` returns the open PR or the most recently updated when multiple PRs exist for the same branch. Current code swallows all errors, so worst case is showing no badge.
- Rate limiting: one `gh` call per non-main worktree per ~5 min is well within GitHub API limits.

## Files inventory

- `main/github.js:111-121` — `gh:pr-for-branch` handler to extend with `statusCheckRollup`.
- `main/github.js:90-98` — `gh:pr-list` handler showing `statusCheckRollup` already in use.
- `renderer/sidebar.js:97-120` — `refreshWorktreeMetrics` function to extend.
- `renderer/github-panel.js:27-34` — `ghChecksBadge` (existing, has bug for StatusContext items).
- `renderer/utils.js` — target for new `prCheckStatus` pure function.
- `preload.js:122` — `window.github.prForBranch` already exposed; no change needed.
- `styles.css:172-186` — `.wt-metric` and color variants; add CI variants here.
