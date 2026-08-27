const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const svgPath = path.join(root, 'build', 'icon.svg');
const pngPath = path.join(root, 'build', 'icon.png');

async function main() {
  let sharp;
  try {
    sharp = require('sharp');
  } catch {
    console.error('sharp が必要です: npm install --save-dev sharp');
    process.exit(1);
  }

  const svg = fs.readFileSync(svgPath);
  await sharp(svg).resize(512, 512).png().toFile(pngPath);
  console.log('Generated:', pngPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
