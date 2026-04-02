const path = require('path');
const os = require('os');
const { pathExists, fsp } = require('./utils');

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
}

module.exports = { migrateData };
