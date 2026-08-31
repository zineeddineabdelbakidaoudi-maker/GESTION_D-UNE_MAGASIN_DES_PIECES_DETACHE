const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function findDirs(startPath, filter) {
  let results = [];
  if (!fs.existsSync(startPath)) return results;
  try {
    const files = fs.readdirSync(startPath);
    for (let i = 0; i < files.length; i++) {
      const filename = path.join(startPath, files[i]);
      try {
        const stat = fs.lstatSync(filename);
        if (stat.isDirectory()) {
          if (filter.test(filename) && fs.existsSync(path.join(filename, 'package.json'))) {
            results.push(filename);
          } else if (!filename.includes('.git') && !filename.includes('dist') && !filename.includes('@types')) {
            results = results.concat(findDirs(filename, filter));
          }
        }
      } catch {}
    }
  } catch {}
  return results;
}

try {
  console.log('?? Locating better-sqlite3 packages...');
  const rootNodeModules = path.resolve(__dirname, '..', 'node_modules');
  const betterDirs = findDirs(rootNodeModules, /[\\\/]better-sqlite3$/);
  
  if (betterDirs.length === 0) {
    console.log('No better-sqlite3 directory found to prebuild.');
  }

  for (const dir of betterDirs) {
    console.log('?? Downloading prebuilt binary in:', dir);
    try {
      execSync('npx --yes prebuild-install', { cwd: dir, stdio: 'inherit' });
      console.log('? Prebuilt binary installed in:', dir);
    } catch (err) {
      console.warn('?? prebuild-install warning in', dir, err.message);
    }
  }
} catch (e) {
  console.warn('ensure-sqlite error:', e.message);
}
