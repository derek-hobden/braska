const path = require('path');
const os = require('os');
const { pathExists, fsp } = require('./utils');

const BUILTIN_AGENTS = ['todoist', 'debugger', 'code-reviewer', 'github-specialist', 'merger'];
const CLAUDE_AGENTS_DIR = path.join(os.homedir(), '.claude', 'agents');

// Only handles simple scalar YAML values (key: value). Multi-line values,
// lists, and nested structures are not parsed — callers use name/description only.
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (key && val) meta[key] = val.replace(/^["']|["']$/g, '');
  }
  return { meta, body: match[2] };
}

async function listAgents() {
  if (!await pathExists(CLAUDE_AGENTS_DIR)) return [];
  const files = await fsp.readdir(CLAUDE_AGENTS_DIR);
  const agents = [];
  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    const content = await fsp.readFile(path.join(CLAUDE_AGENTS_DIR, file), 'utf-8');
    const { meta } = parseFrontmatter(content);
    const name = meta.name || file.replace(/\.md$/, '');
    agents.push({
      name,
      description: meta.description || '',
      builtin: BUILTIN_AGENTS.includes(name),
    });
  }
  return agents;
}

function register({ ipcMain }) {
  ipcMain.handle('agents:list', () => listAgents());
}

module.exports = { register, listAgents, BUILTIN_AGENTS, CLAUDE_AGENTS_DIR };
