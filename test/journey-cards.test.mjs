// Tests for Fix 2: pull-remote card should NOT appear when there are dirty files.
// Tests the pure card-computation function extracted from journey-zone.js.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeJourneyCards } from '../renderer/journey-cards.mjs';

// Helper: build a minimal status object
function status(overrides = {}) {
  return {
    branch: 'feat/x',
    staged: [],
    unstaged: [],
    untracked: [],
    conflicted: [],
    mainDivergence: null,
    ...overrides,
  };
}

function cardKeys(cards) {
  return cards.map(c => c.key);
}

describe('computeJourneyCards', () => {

  // ── Pull-remote card gating ──────────────────────────────────

  it('shows pull-remote card when pushBehind > 0 and NO dirty files', () => {
    const s = status({
      mainDivergence: { ahead: 0, behind: 0, pushAhead: 0, pushBehind: 3, hasUpstream: true },
    });
    const cards = computeJourneyCards(s);
    assert.ok(cardKeys(cards).includes('pull-remote'),
      `expected pull-remote in [${cardKeys(cards)}]`);
  });

  it('does NOT show pull-remote card when pushBehind > 0 AND dirty files exist', () => {
    const s = status({
      unstaged: [{ file: 'a.js', added: 1, deleted: 0 }],
      mainDivergence: { ahead: 0, behind: 0, pushAhead: 0, pushBehind: 3, hasUpstream: true },
    });
    const cards = computeJourneyCards(s);
    assert.ok(!cardKeys(cards).includes('pull-remote'),
      `pull-remote should be gated by dirty files, got [${cardKeys(cards)}]`);
  });

  it('shows commit card when dirty files exist', () => {
    const s = status({
      unstaged: [{ file: 'a.js', added: 1, deleted: 0 }],
    });
    const cards = computeJourneyCards(s);
    assert.ok(cardKeys(cards).includes('commit'),
      `expected commit in [${cardKeys(cards)}]`);
  });

  // ── Conflict gating ──────────────────────────────────────────

  it('shows only conflicts card when conflicted files exist', () => {
    const s = status({
      conflicted: ['file.js'],
      mainDivergence: { ahead: 0, behind: 0, pushAhead: 0, pushBehind: 3, hasUpstream: true },
    });
    const cards = computeJourneyCards(s);
    assert.deepEqual(cardKeys(cards), ['conflicts']);
  });

  // ── Behind-main card ─────────────────────────────────────────

  it('shows behind-main card when behind > 0 and clean', () => {
    const s = status({
      mainDivergence: { ahead: 2, behind: 5, pushAhead: 0, pushBehind: 0, hasUpstream: false },
    });
    const cards = computeJourneyCards(s);
    assert.ok(cardKeys(cards).includes('behind-main'),
      `expected behind-main in [${cardKeys(cards)}]`);
  });

  // ── Share cards ──────────────────────────────────────────────

  it('shows push card when pushAhead > 0 with upstream', () => {
    const s = status({
      mainDivergence: { ahead: 2, behind: 0, pushAhead: 3, pushBehind: 0, hasUpstream: true },
    });
    const cards = computeJourneyCards(s);
    assert.ok(cardKeys(cards).includes('share'),
      `expected share in [${cardKeys(cards)}]`);
  });

  it('shows share card for unpublished feature branch with commits', () => {
    const s = status({
      branch: 'feat/new-thing',
      mainDivergence: { ahead: 2, behind: 0, pushAhead: 0, pushBehind: 0, hasUpstream: false },
    });
    const cards = computeJourneyCards(s);
    assert.ok(cardKeys(cards).includes('share'),
      `expected share in [${cardKeys(cards)}]`);
  });

  // ── Post-merge card ──────────────────────────────────────────

  it('shows post-merge card when mergeInfo is provided', () => {
    const s = status();
    const cards = computeJourneyCards(s, {
      mergeInfo: { featureBranch: 'feat/x', targetBranch: 'main' },
    });
    assert.ok(cardKeys(cards).includes('post-merge'),
      `expected post-merge in [${cardKeys(cards)}]`);
  });

  // ── Empty state ──────────────────────────────────────────────

  it('returns empty array when nothing is actionable', () => {
    const s = status({ branch: 'main' });
    const cards = computeJourneyCards(s);
    assert.equal(cards.length, 0);
  });

  // ── Diverged state (pushAhead > 0 AND pushBehind > 0) ────────

  it('diverged state — shows sync card when pushAhead > 0 and pushBehind > 0 (clean)', () => {
    const s = status({
      branch: 'main',
      mainDivergence: { ahead: 0, behind: 0, pushAhead: 2, pushBehind: 1, hasUpstream: true },
    });
    const cards = computeJourneyCards(s);
    assert.ok(cardKeys(cards).includes('sync'),
      `expected sync card in [${cardKeys(cards)}]`);
    const syncCard = cards.find(c => c.key === 'sync');
    const actions = syncCard.buttons.map(b => b.action);
    assert.ok(actions.includes('pull-push'), `expected pull-push action in [${actions}]`);
    assert.ok(actions.includes('pull'), `expected pull action in [${actions}]`);
  });

  it('diverged state — does NOT show separate pull-remote or share cards when diverged', () => {
    const s = status({
      branch: 'main',
      mainDivergence: { ahead: 0, behind: 0, pushAhead: 2, pushBehind: 1, hasUpstream: true },
    });
    const cards = computeJourneyCards(s);
    assert.ok(!cardKeys(cards).includes('pull-remote'),
      `pull-remote should not appear in diverged state, got [${cardKeys(cards)}]`);
    assert.ok(!cardKeys(cards).includes('share'),
      `share should not appear in diverged state, got [${cardKeys(cards)}]`);
  });

  it('diverged state — dirty files still show commit card (not sync card)', () => {
    const s = status({
      branch: 'main',
      unstaged: [{ file: 'a.js', added: 1, deleted: 0 }],
      mainDivergence: { ahead: 0, behind: 0, pushAhead: 2, pushBehind: 1, hasUpstream: true },
    });
    const cards = computeJourneyCards(s);
    assert.ok(cardKeys(cards).includes('commit'),
      `expected commit card when dirty, got [${cardKeys(cards)}]`);
    assert.ok(!cardKeys(cards).includes('sync'),
      `sync should not appear when dirty, got [${cardKeys(cards)}]`);
  });
});
