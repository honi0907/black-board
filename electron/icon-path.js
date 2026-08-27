const { app } = require('electron');
const path = require('path');
const fs = require('fs');

function resolveAppIconPath() {
  const candidates = [];
  if (app.isPackaged) {
    candidates.push(path.join(process.resourcesPath, 'icon.ico'));
    candidates.push(path.join(process.resourcesPath, 'icon.png'));
  }
  candidates.push(path.join(__dirname, '..', 'build', 'icon.ico'));
  candidates.push(path.join(__dirname, '..', 'build', 'icon.png'));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

module.exports = { resolveAppIconPath };
