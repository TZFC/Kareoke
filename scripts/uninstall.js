const fs = require('fs');
const path = require('path');
const os = require('os');

const isWindows = process.platform === 'win32';
const appData = process.env.APPDATA || (isWindows ? path.join(os.homedir(), 'AppData', 'Roaming') : null);

function getRoamingAppRoot() {
  if (!appData) {
    return null;
  }
  return path.join(appData, 'peachy-kareoke');
}

async function removePath(targetPath) {
  if (!targetPath || !fs.existsSync(targetPath)) {
    return false;
  }

  try {
    await fs.promises.rm(targetPath, { recursive: true, force: true });
    return true;
  } catch (error) {
    console.error(`Failed to remove ${targetPath}:`, error.message || error);
    return false;
  }
}

(async () => {
  console.log('PeachyKareoke uninstall helper');
  if (!isWindows) {
    console.error('This uninstall helper is designed for Windows roaming data deletion.');
    process.exit(1);
  }

  const roamingRoot = getRoamingAppRoot();
  if (!roamingRoot) {
    console.error('Could not determine APPDATA path.');
    process.exit(1);
  }

  const installedDataPath = path.join(roamingRoot, 'PeachyKareoke');
  console.log(`Removing embedded app data at: ${installedDataPath}`);
  const removed = await removePath(installedDataPath);
  if (removed) {
    console.log('Removed embedded app data successfully.');
  } else {
    console.log('No embedded app data found or removal failed.');
  }

  try {
    const parentEmpty = fs.existsSync(roamingRoot) && (await fs.promises.readdir(roamingRoot)).length === 0;
    if (parentEmpty) {
      await removePath(roamingRoot);
      console.log(`Removed empty parent directory: ${roamingRoot}`);
    }
  } catch {
    // ignore cleanup failure
  }

  process.exit(removed ? 0 : 1);
})();
