const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const version = require(path.join(root, 'package.json')).version;
const exeName = `Black.Board-Setup-${version}.exe`;
const exePath = path.join(root, 'dist', exeName);

if (!fs.existsSync(exePath)) {
  const fallback = path.join(root, 'dist', `Black Board-Setup-${version}.exe`);
  if (!fs.existsSync(fallback)) {
    console.error('Installer not found:', exePath);
    process.exit(1);
  }
  fs.copyFileSync(fallback, exePath);
}

const data = fs.readFileSync(exePath);
const sha512 = crypto.createHash('sha512').update(data).digest('base64');
const releaseDate = new Date().toISOString();
const yml = [
  `version: ${version}`,
  'files:',
  `  - url: ${exeName}`,
  `    sha512: ${sha512}`,
  `    size: ${data.length}`,
  `path: ${exeName}`,
  `sha512: ${sha512}`,
  `releaseDate: '${releaseDate}'`,
  '',
].join('\n');

const outPath = path.join(root, 'dist', 'latest.yml');
fs.writeFileSync(outPath, yml, 'utf8');
console.log('Wrote', outPath);
