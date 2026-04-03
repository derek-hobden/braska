const path = require('path');
const os = require('os');
const { fsp, pathExists } = require('./utils');
const { CLAUDE_AGENTS_DIR } = require('./agents');

const AGENTS_SRC = path.join(__dirname, '..', 'agents');
const CLAUDE_SCRIPTS_DIR = path.join(os.homedir(), '.claude', 'scripts');

async function ensureBuiltinAgents() {
  await fsp.mkdir(CLAUDE_AGENTS_DIR, { recursive: true });

  // Copy agent .md files — skip if already exists to preserve user customizations.
  // Users who want to reset to defaults can delete the file and restart.
  let entries;
  try {
    entries = await fsp.readdir(AGENTS_SRC, { withFileTypes: true });
  } catch (err) {
    console.warn('Could not read builtin agents directory:', err.message);
    return;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const dest = path.join(CLAUDE_AGENTS_DIR, entry.name);
    if (await pathExists(dest)) continue;
    await fsp.copyFile(path.join(AGENTS_SRC, entry.name), dest);
  }

  // Copy hook scripts (skip if already exists)
  const scriptsSrc = path.join(AGENTS_SRC, 'scripts');
  if (!await pathExists(scriptsSrc)) return;
  const scriptDirs = await fsp.readdir(scriptsSrc, { withFileTypes: true });
  for (const dir of scriptDirs) {
    if (!dir.isDirectory()) continue;
    const destDir = path.join(CLAUDE_SCRIPTS_DIR, dir.name);
    await fsp.mkdir(destDir, { recursive: true });
    const scripts = await fsp.readdir(path.join(scriptsSrc, dir.name));
    for (const script of scripts) {
      const dest = path.join(destDir, script);
      if (await pathExists(dest)) continue;
      await fsp.copyFile(path.join(scriptsSrc, dir.name, script), dest);
      if (script.endsWith('.sh')) await fsp.chmod(dest, 0o755);
    }
  }
}

module.exports = { ensureBuiltinAgents };
