// Tests for Issue #37: close icon should use SVG x-circle instead of &times; entity
// Tests read source files as text — correct for renderer modules that depend on DOM at module scope.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const sidebarSrc = fs.readFileSync(path.resolve(__dirname, '../renderer/sidebar.js'), 'utf8');
const stylesSrc = fs.readFileSync(path.resolve(__dirname, '../styles.css'), 'utf8');

describe('remove-btn', () => {
  it('renders SVG not times entity', () => {
    // The button template must use the SVG_X_CIRCLE constant, not &times;
    assert.ok(
      !sidebarSrc.includes('&times;'),
      'sidebar.js must not use &times; entity for the remove button'
    );
    assert.ok(
      sidebarSrc.includes('SVG_X_CIRCLE'),
      'sidebar.js must define and use SVG_X_CIRCLE for the remove button'
    );
  });

  it('SVG has circle and x lines', () => {
    // Extract the SVG_X_CIRCLE constant value
    const match = sidebarSrc.match(/SVG_X_CIRCLE\s*=\s*'([^']+)'/);
    assert.ok(match, 'SVG_X_CIRCLE constant must be defined');
    const svgSrc = match[1];
    assert.ok(svgSrc.includes('<circle'), 'SVG_X_CIRCLE must contain a <circle element');
    assert.ok(svgSrc.includes('<line'), 'SVG_X_CIRCLE must contain <line elements for the X');
  });

  it('CSS opacity at rest is 0.5', () => {
    // Remove btn should be visible at rest, matching project-section-link
    const removeBtnBlock = stylesSrc.match(/\.remove-btn\s*\{([^}]+)\}/);
    assert.ok(removeBtnBlock, '.remove-btn CSS block must exist');
    const block = removeBtnBlock[1];
    assert.ok(
      block.includes('opacity: 0.5'),
      '.remove-btn must have opacity: 0.5 at rest (currently 0.15 — too dark)'
    );
  });
});
