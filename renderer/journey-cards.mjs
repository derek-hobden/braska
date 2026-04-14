// Pure card computation for the journey zone.
// No DOM access, no side effects — just status in, cards out.

export function computeJourneyCards(status, opts = {}) {
  const div = status?.mainDivergence;
  const isFeatureBranch = status?.branch && status.branch !== 'main' && status.branch !== 'master';
  const dirtyCount = (status?.staged?.length || 0) + (status?.unstaged?.length || 0) + (status?.untracked?.length || 0);
  const cards = [];

  // ── Priority 0: Merge conflicts (blocks everything) ──
  const conflicted = status?.conflicted || [];
  if (conflicted.length > 0) {
    cards.push({
      key: 'conflicts', accent: 'conflict',
      title: `Resolve conflicts (${conflicted.length} file${conflicted.length !== 1 ? 's' : ''})`,
      buttons: [{ label: 'Open Merger ✦', action: 'open-merger' }],
    });
    return cards;
  }

  // ── Priority 1: Behind remote — only when clean ──
  // Gated behind dirty files: pulling with uncommitted changes fails in
  // most git configurations, so don't offer it. Commit/stash first.
  if (div?.pushBehind > 0 && dirtyCount === 0) {
    cards.push({
      key: 'pull-remote', accent: 'warning',
      title: `Pull changes (${div.pushBehind} new)`,
      tooltip: 'Download new changes from GitHub',
      buttons: [{ label: 'Pull', action: 'pull' }],
    });
  }

  // ── Priority 2: Dirty files — gate for everything below ──
  if (dirtyCount > 0) {
    const subtitle = div?.behind > 0 ? `also ${div.behind} behind main` : null;
    cards.push({
      key: 'commit', accent: 'action',
      title: `Commit changes (${dirtyCount} file${dirtyCount !== 1 ? 's' : ''})`,
      subtitle, subtitleAction: div?.behind > 0 ? 'pull-main' : null,
      buttons: [
        { label: 'Review First', action: 'review', primary: true },
        { label: 'Commit ✦', action: 'commit', primary: false },
      ],
    });
    return cards;
  }

  // ── Below here: working tree is clean ──

  // ── Priority 3: Post-merge state ──
  const mergeInfo = opts.mergeInfo || null;
  if (mergeInfo) {
    cards.push({
      key: 'post-merge', accent: 'ready',
      title: `Merged into ${mergeInfo.targetBranch}`,
      tooltip: `${mergeInfo.featureBranch} has been merged locally`,
      buttons: [
        { label: 'Push main', action: 'push-main', primary: true },
        { label: 'Clean up branch', action: 'cleanup-branch', primary: false },
      ],
    });
    return cards;
  }

  // ── Priority 4: Behind main ──
  if (div?.behind > 0) {
    cards.push({
      key: 'behind-main', accent: 'warning',
      title: `Update from main (${div.behind} behind)`,
      tooltip: 'Get the latest changes from the main branch',
      buttons: [{ label: 'Update', action: 'pull-main' }],
    });
  }

  // ── Priority 5: Ready to share ──
  if (div?.pushAhead > 0 && div.hasUpstream) {
    const btns = [{ label: 'Push', action: 'push', primary: true }];
    if (isFeatureBranch) btns.push({ label: 'Push & Create PR', action: 'push-pr', primary: true });
    cards.push({
      key: 'share', accent: 'ready',
      title: `Push (${div.pushAhead} commit${div.pushAhead !== 1 ? 's' : ''})`,
      tooltip: 'Upload your commits to GitHub',
      buttons: btns,
    });
  } else if (div && !div.hasUpstream && isFeatureBranch && div.ahead > 0) {
    cards.push({
      key: 'share', accent: 'ready',
      title: `Ready to share (${div.ahead} commit${div.ahead !== 1 ? 's' : ''})`,
      tooltip: 'Choose how to share your work',
      buttons: [
        { label: 'Publish & PR', action: 'publish-pr', primary: true },
        { label: 'Merge to main', action: 'merge-to-main', primary: false },
      ],
    });
  }

  return cards;
}
