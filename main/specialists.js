const path = require('path');
const os = require('os');
const { pathExists, resolveInDir, fsp } = require('./utils');
const { getSkillsDir } = require('./skills');

const BUILTIN_SPECIALISTS = ['todoist', 'debugger', 'code-reviewer', 'github-specialist', 'merger'];

async function getSpecialistsDir() {
  const dir = path.join(os.homedir(), '.braska', 'specialists');
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

async function listSpecialists() {
  const dir = await getSpecialistsDir();
  const dirents = (await fsp.readdir(dir, { withFileTypes: true })).filter(d => d.isDirectory());
  return Promise.all(dirents.map(async d => {
    const specialistDir = path.join(dir, d.name);
    const claudeFile = path.join(specialistDir, 'claude.md');
    let instructions = '';
    try { instructions = await fsp.readFile(claudeFile, 'utf-8'); } catch {}
    const skillsDir = path.join(specialistDir, '.claude', 'skills');
    let skills = [];
    if (await pathExists(skillsDir)) {
      skills = (await fsp.readdir(skillsDir, { withFileTypes: true }))
        .filter(d => d.isDirectory())
        .map(d => d.name);
    }
    return { name: d.name, instructions, skills, builtin: BUILTIN_SPECIALISTS.includes(d.name) };
  }));
}

function register({ ipcMain }) {
  ipcMain.handle('specialists:list', () => listSpecialists());

  ipcMain.handle('specialists:save', async (_event, name, instructions, skillNames) => {
    const safe = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const specialistDir = path.join(await getSpecialistsDir(), safe);
    const skillsDir = path.join(specialistDir, '.claude', 'skills');
    await fsp.mkdir(skillsDir, { recursive: true });
    await fsp.writeFile(path.join(specialistDir, 'claude.md'), instructions, 'utf-8');
    // Clear existing skill directories
    for (const f of await fsp.readdir(skillsDir)) {
      const p = path.join(skillsDir, f);
      try { await fsp.rm(p, { recursive: true, force: true }); } catch {}
    }
    // Create skill directories with SKILL.md symlinks
    const srcSkillsDir = await getSkillsDir();
    for (const sk of skillNames) {
      const target = path.join(srcSkillsDir, `${sk}.md`);
      if (!await pathExists(target)) continue;
      const skillDir = path.join(skillsDir, sk);
      await fsp.mkdir(skillDir, { recursive: true });
      await fsp.symlink(target, path.join(skillDir, 'SKILL.md'));
    }
    return listSpecialists();
  });

  ipcMain.handle('specialists:remove', async (_event, name) => {
    const dir = await getSpecialistsDir();
    const specialistDir = resolveInDir(dir, name);
    if (await pathExists(specialistDir)) await fsp.rm(specialistDir, { recursive: true, force: true });
    return listSpecialists();
  });
}

module.exports = { register, getSpecialistsDir, listSpecialists };
