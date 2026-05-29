import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { prStateBadgeClass } from '../renderer/utils.js';

test('prStateBadgeClass maps OPEN (non-draft) to "open"', () => {
  assert.equal(prStateBadgeClass('OPEN'), 'open');
  assert.equal(prStateBadgeClass('OPEN', false), 'open');
});

test('prStateBadgeClass maps OPEN + isDraft to "draft"', () => {
  assert.equal(prStateBadgeClass('OPEN', true), 'draft');
});

test('prStateBadgeClass ignores isDraft when state is CLOSED or MERGED', () => {
  assert.equal(prStateBadgeClass('CLOSED', true), 'closed');
  assert.equal(prStateBadgeClass('MERGED', true), 'merged');
});

test('prStateBadgeClass maps CLOSED to "closed"', () => {
  assert.equal(prStateBadgeClass('CLOSED'), 'closed');
});

test('prStateBadgeClass maps MERGED to "merged"', () => {
  assert.equal(prStateBadgeClass('MERGED'), 'merged');
});

test('prStateBadgeClass returns null for unknown / missing state', () => {
  assert.equal(prStateBadgeClass(null), null);
  assert.equal(prStateBadgeClass(undefined), null);
  assert.equal(prStateBadgeClass(''), null);
  assert.equal(prStateBadgeClass('DRAFT'), null);
  assert.equal(prStateBadgeClass('open'), null);
});
