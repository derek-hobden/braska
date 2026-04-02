const path = require('path');
const { fsp } = require('./utils');
const { getSpecialistsDir } = require('./specialists');

const TEMPLATES_DIR = path.join(__dirname, '..', 'specialists');

async function copyIfNewer(src, dest) {
  const srcStat = await fsp.stat(src);
  const destStat = await fsp.stat(dest).catch(() => null);
  if (destStat && destStat.mtimeMs >= srcStat.mtimeMs) return;
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.copyFile(src, dest);
  if (src.endsWith('.sh')) await fsp.chmod(dest, 0o755);
}

async function copyDirRecursive(srcDir, destDir) {
  const entries = await fsp.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, destPath);
    } else {
      await copyIfNewer(srcPath, destPath);
    }
  }
}

async function ensureBuiltinSpecialists() {
  const specialistsDir = await getSpecialistsDir();
  const names = await fsp.readdir(TEMPLATES_DIR, { withFileTypes: true });
  for (const entry of names) {
    if (!entry.isDirectory()) continue;
    await copyDirRecursive(
      path.join(TEMPLATES_DIR, entry.name),
      path.join(specialistsDir, entry.name)
    );
  }
}

module.exports = { ensureBuiltinSpecialists };
