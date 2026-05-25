// Pure utility: group a flat worktrees array into a depth-annotated list
// reflecting the parent-branch hierarchy recorded in each wt.parentBranch.
//
// No DOM dependencies — importable from tests and renderer alike.

/**
 * Given a flat array of worktree objects (each optionally having a
 * `parentBranch` string), returns an array of `{ wt, depth }` items
 * in parent-before-child order, suitable for linear rendering with
 * depth-driven indentation.
 *
 * Fallback rules:
 * - No `parentBranch`, or `parentBranch` not present in the worktree set → depth 0.
 * - `parentBranch === null` → depth 0.
 * - Detached-HEAD worktrees (`branch === '(detached)'`) are never used as parents.
 */
export function buildWorktreeTree(worktrees) {
  // Build branch → worktree map, excluding detached entries as parent candidates.
  const byBranch = new Map();
  for (const wt of worktrees) {
    if (wt.branch && wt.branch !== '(detached)') byBranch.set(wt.branch, wt);
  }

  const childrenOf = new Map(); // parentBranch → child worktree[]
  const roots = [];

  for (const wt of worktrees) {
    const p = wt.parentBranch;
    if (p && byBranch.has(p)) {
      if (!childrenOf.has(p)) childrenOf.set(p, []);
      childrenOf.get(p).push(wt);
    } else {
      roots.push(wt);
    }
  }

  const result = [];
  const visited = new Set();

  function visit(wt, depth) {
    if (visited.has(wt)) return; // guard against any accidental cycles
    visited.add(wt);
    result.push({ wt, depth });
    for (const child of (childrenOf.get(wt.branch) || [])) {
      visit(child, depth + 1);
    }
  }

  for (const root of roots) visit(root, 0);

  // Any unreached entries (e.g., no branch field) appear at the end, depth 0.
  for (const wt of worktrees) {
    if (!visited.has(wt)) result.push({ wt, depth: 0 });
  }

  return result;
}
