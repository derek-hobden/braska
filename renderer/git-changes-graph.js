// ── Git graph computation + commit/stash element rendering ───────
import { escHtml } from './utils.js';

// ── Graph colors (one per lane) ─────────────────────────────────
const GRAPH_COLORS = ['#4a9eff', '#3fb950', '#f0883e', '#bc8cff', '#f85149', '#56d4dd', '#e3b341', '#db61a2'];

// ── Graph dimensions ────────────────────────────────────────────
export const GRAPH_ROW_H = 28;
export const GRAPH_COL_W = 10;

// ── Compute lane assignments + connector lines for a commit list ─
export function computeGraph(commits) {
  // lanes: array of hash strings occupying each column, null = empty
  const lanes = [];
  const rows = [];

  for (let i = 0; i < commits.length; i++) {
    const c = commits[i];
    const hash = c.hash;
    const parents = c.parents || [];

    // Find which lane this commit occupies (it was reserved by a child)
    let col = lanes.indexOf(hash);
    if (col === -1) {
      // First commit or branch head — find an empty lane or append
      col = lanes.indexOf(null);
      if (col === -1) { col = lanes.length; lanes.push(null); }
    }
    lanes[col] = null; // free the lane

    // Connections: lines from this row to the next
    const connectors = []; // { fromCol, toCol }

    // First parent continues straight down in same lane
    if (parents[0]) {
      const existingLane = lanes.indexOf(parents[0]);
      if (existingLane !== -1) {
        // Parent already has a lane (merge target) — draw line to it
        connectors.push({ fromCol: col, toCol: existingLane });
      } else {
        // Reserve this lane for first parent
        lanes[col] = parents[0];
        connectors.push({ fromCol: col, toCol: col });
      }
    }

    // Additional parents (merge sources) — find or create lanes
    for (let p = 1; p < parents.length; p++) {
      const parentHash = parents[p];
      let pLane = lanes.indexOf(parentHash);
      if (pLane === -1) {
        // Find empty lane or create new one
        pLane = lanes.indexOf(null);
        if (pLane === -1) { pLane = lanes.length; lanes.push(null); }
        lanes[pLane] = parentHash;
      }
      connectors.push({ fromCol: col, toCol: pLane });
    }

    // Pass-through lanes: lanes occupied by hashes not involved in this commit
    for (let l = 0; l < lanes.length; l++) {
      if (lanes[l] !== null && l !== col) {
        connectors.push({ fromCol: l, toCol: l });
      }
    }

    // Trim trailing nulls from lanes
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop();

    rows.push({
      col,
      color: GRAPH_COLORS[col % GRAPH_COLORS.length],
      connectors,
      totalLanes: Math.max(lanes.length, col + 1),
      isMerge: parents.length > 1,
    });
  }

  const maxLanes = rows.length ? Math.max(...rows.map(r => r.totalLanes)) : 1;
  return { rows, maxLanes };
}

// ── Render the full graph column as a single SVG ────────────────
export function renderFullGraphSvg(graph) {
  const { rows, maxLanes } = graph;
  const w = (maxLanes + 1) * GRAPH_COL_W;
  const h = rows.length * GRAPH_ROW_H;
  if (!w || !h) return '';
  const lines = [];
  const nodes = [];
  const sw = 1.5;
  const x = (col) => col * GRAPH_COL_W + GRAPH_COL_W / 2;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const cy = i * GRAPH_ROW_H + GRAPH_ROW_H / 2;

    for (const conn of row.connectors) {
      const x1 = x(conn.fromCol);
      const x2 = x(conn.toCol);
      // Next row's center, or just the bottom edge if last row
      const ny = (i + 1) < graph.rows.length
        ? (i + 1) * GRAPH_ROW_H + GRAPH_ROW_H / 2
        : h;

      if (conn.fromCol === row.col) {
        // Line from this commit's node down
        const color = GRAPH_COLORS[conn.toCol % GRAPH_COLORS.length];
        if (x1 === x2) {
          lines.push(`<line x1="${x1}" y1="${cy}" x2="${x2}" y2="${ny}" stroke="${color}" stroke-width="${sw}"/>`);
        } else {
          lines.push(`<path d="M${x1},${cy} C${x1},${cy + GRAPH_ROW_H * 0.7} ${x2},${ny - GRAPH_ROW_H * 0.7} ${x2},${ny}" stroke="${color}" stroke-width="${sw}" fill="none"/>`);
        }
      } else {
        // Pass-through: this lane has no node here, just continues straight
        const color = GRAPH_COLORS[conn.fromCol % GRAPH_COLORS.length];
        lines.push(`<line x1="${x1}" y1="${cy}" x2="${x2}" y2="${ny}" stroke="${color}" stroke-width="${sw}"/>`);
      }
    }

    // Node circle
    const r = row.isMerge ? 3.5 : 2.5;
    nodes.push(`<circle cx="${x(row.col)}" cy="${cy}" r="${r}" fill="${row.color}" stroke="#111" stroke-width="1"/>`);
  }

  // Lines behind nodes
  return `<svg class="git-graph-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${lines.join('')}${nodes.join('')}</svg>`;
}

// ── Commit element ──────────────────────────────────────────────
export function createCommitEl(c) {
  const el = document.createElement('div');
  el.className = 'changes-commit';
  el.dataset.hash = c.hash;
  el.innerHTML = `<div class="changes-commit-header"><span class="changes-commit-hash">${c.hash.slice(0, 7)}</span><span class="changes-commit-msg">${escHtml(c.message)}</span><button class="changes-commit-revert" data-revert-hash="${escHtml(c.hash)}" title="Revert this commit (creates a new undo commit)">Revert</button></div><div class="changes-commit-meta">${escHtml(c.author)} &middot; ${escHtml(c.date)}</div><div class="changes-commit-files"></div>`;
  return el;
}

// ── Stash element ───────────────────────────────────────────────
export function createStashEl(s, i) {
  const el = document.createElement('div');
  el.className = 'changes-stash-entry';
  el.innerHTML = `<span class="changes-stash-msg">${escHtml(s.message)}</span><span class="changes-stash-date">${escHtml(s.date)}</span><button class="changes-stash-btn pop" data-index="${i}" title="Pop stash">Pop</button><button class="changes-stash-btn drop" data-index="${i}" title="Drop stash">Drop</button>`;
  return el;
}
