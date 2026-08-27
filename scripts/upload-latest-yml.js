const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const version = require(path.join(root, 'package.json')).version;
const tmpDir = path.join(root, 'dist-update');
const exeName = `Black.Board-Setup-${version}.exe`;
const exePath = path.join(tmpDir, exeName);

fs.mkdirSync(tmpDir, { recursive: true });

execSync(`gh release download v${version} -p "${exeName}" -D "${tmpDir}" --repo honi0907/black-board --clobber`, {
  stdio: 'inherit',
});

const data = fs.readFileSync(exePath);
const sha512 = crypto.createHash('sha512').update(data).digest('base64');
const latest = {
  version,
  files: [
    {
      url: exeName,
      sha512,
      size: data.length,
    },
  ],
  path: exeName,
  sha512,
  releaseDate: new Date().toISOString(),
};

const yml = [
  `version: ${latest.version}`,
  'files:',
  `  - url: ${latest.files[0].url}`,
  `    sha512: ${latest.files[0].sha512}`,
  `    size: ${latest.files[0].size}`,
  `path: ${latest.path}`,
  `sha512: ${latest.sha512}`,
  `releaseDate: '${latest.releaseDate}'`,
  '',
].join('\n');

const outPath = path.join(root, 'dist', 'latest.yml');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, yml, 'utf8');
console.log('Wrote', outPath);

execSync(`gh release upload v${version} "${outPath}" --repo honi0907/black-board --clobber`, {
  stdio: 'inherit',
});

console.log('Uploaded latest.yml to release v' + version);
