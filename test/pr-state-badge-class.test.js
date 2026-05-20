import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { prStateBadgeClass } from '../renderer/utils.js';

test('prStateBadgeClass maps OPEN to "open"', () => {
  assert.equal(prStateBadgeClass('OPEN'), 'open');
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
