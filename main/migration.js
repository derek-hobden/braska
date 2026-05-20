const path = require('path');
const os = require('os');
const { pathExists, fsp } = require('./utils');
const { BUILTIN_AGENTS, CLAUDE_AGENTS_DIR } = require('./agents');
const { loadProjects } = require('./projects');

async function migrateData(app) {
  // Home directory: ~/.the-agency -> ~/.braska, ~/.yuna -> ~/.braska
  const braskaHome = path.join(os.homedir(), '.braska');
  try {
    const agencyHome = path.join(os.homedir(), '.the-agency');
    if (await pathExists(agencyHome) && !await pathExists(braskaHome)) {
      await fsp.rename(agencyHome, braskaHome);
    }
    const yunaHome = path.join(os.homedir(), '.yuna');
    if (await pathExists(yunaHome) && !await pathExists(braskaHome)) {
      await fsp.rename(yunaHome, braskaHome);
    }
  } catch (err) {
    console.error('Failed to migrate home directory:', err.message);
  }

  // Electron userData: projects.json
  const newUserData = app.getPath('userData');
  const newProjects = path.join(newUserData, 'projects.json');
  for (const legacyName of ['the-agency', 'Yuna']) {
    try {
      const oldUserData = path.join(app.getPath('appData'), legacyName);
      if (oldUserData !== newUserData) {
        const oldProjects = path.join(oldUserData, 'projects.json');
        if (await pathExists(oldProjects) && !await pathExists(newProjects)) {
          await fsp.mkdir(newUserData, { recursive: true });
          await fsp.copyFile(oldProjects, newProjects);
        }
      }
    } catch (err) {
      console.error(`Failed to migrate userData from ${legacyName}:`, err.message);
    }
  }

  // Per-project: <repo>/.the-agency/worktree-issues.json -> ~/.braska/projects/<name>/worktree-issues.json
  // and remove the empty .the-agency/ directory left in any project.
  try {
    const projects = await loadProjects(app);
    for (const p of projects) {
      if (!p || !p.path) continue;
      const legacyDir = path.join(p.path, '.the-agency');
      const legacyFile = path.join(legacyDir, 'worktree-issues.json');
      const newDir = path.join(braskaHome, 'projects', path.basename(p.path));
      const newFile = path.join(newDir, 'worktree-issues.json');
      if (await pathExists(legacyFile) && !await pathExists(newFile)) {
        await fsp.mkdir(newDir, { recursive: true });
        await fsp.rename(legacyFile, newFile);
      }
      try { await fsp.rmdir(legacyDir); } catch { /* not empty or absent — leave it */ }
    }
  } catch (err) {
    console.error('Failed to migrate per-project worktree-issues:', err.message);
  }
}

// One-time migration: convert custom specialists from ~/.braska/specialists/ to ~/.claude/agents/
async function migrateSpecialistsToAgents() {
  const markerFile = path.join(os.homedir(), '.braska', '.agents-migrated');
  if (await pathExists(markerFile)) return;
  const specialistsDir = path.join(os.homedir(), '.braska', 'specialists');
  if (!await pathExists(specialistsDir)) return;
  const entries = await fsp.readdir(specialistsDir, { withFileTypes: true });
  await fsp.mkdir(CLAUDE_AGENTS_DIR, { recursive: true });
  let failures = 0;
  let attempted = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!/^[a-zA-Z0-9_-]+$/.test(entry.name)) continue;
    if (BUILTIN_AGENTS.includes(entry.name)) continue;
    const claudeMd = path.join(specialistsDir, entry.name, 'claude.md');
    if (!await pathExists(claudeMd)) continue;
    const dest = path.join(CLAUDE_AGENTS_DIR, `${entry.name}.md`);
    if (await pathExists(dest)) continue;
    attempted++;
    try {
      const body = await fsp.readFile(claudeMd, 'utf-8');
      // bypassPermissions matches old behavior where all specialists ran with --dangerously-skip-permissions
      const content = `---\nname: "${entry.name}"\ndescription: Migrated from Braska specialist\npermissionMode: bypassPermissions\n---\n\n${body}`;
      await fsp.writeFile(dest, content, 'utf-8');
    } catch (err) {
      failures++;
      console.error(`Failed to migrate specialist ${entry.name}:`, err.message);
    }
  }
  // Only mark migration complete if there were no unresolved failures
  if (failures > 0) {
    console.warn(`Specialist migration: ${failures}/${attempted} failed — will retry on next launch`);
    return;
  }
  try { await fsp.writeFile(markerFile, '', 'utf-8'); } catch (err) {
    console.warn('Could not write migration marker:', err.message);
  }
}

module.exports = { migrateData, migrateSpecialistsToAgents };
