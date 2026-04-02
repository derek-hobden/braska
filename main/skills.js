const path = require('path');
const os = require('os');
const { pathExists, resolveInDir, fsp } = require('./utils');

async function getSkillsDir() {
  const dir = path.join(os.homedir(), '.braska', 'skills');
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

async function listSkills() {
  const dir = await getSkillsDir();
  const files = (await fsp.readdir(dir)).filter(f => f.endsWith('.md'));
  return Promise.all(files.map(async f => {
    const content = await fsp.readFile(path.join(dir, f), 'utf-8');
    return { name: f.replace(/\.md$/, ''), content };
  }));
}

function register({ ipcMain }) {
  ipcMain.handle('skills:list', () => listSkills());

  ipcMain.handle('skills:save', async (_event, name, content) => {
    const safe = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    await fsp.writeFile(path.join(await getSkillsDir(), `${safe}.md`), content, 'utf-8');
    return listSkills();
  });

  ipcMain.handle('skills:remove', async (_event, name) => {
    const dir = await getSkillsDir();
    const file = resolveInDir(dir, `${name}.md`);
    if (await pathExists(file)) await fsp.unlink(file);
    return listSkills();
  });
}

module.exports = { register, getSkillsDir, listSkills };
