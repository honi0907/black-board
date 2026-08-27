const fs = require('fs');
const path = require('path');
const toIco = require('to-ico');

const root = path.join(__dirname, '..');
const svgPath = path.join(root, 'build', 'icon.svg');
const pngPath = path.join(root, 'build', 'icon.png');
const icoPath = path.join(root, 'build', 'icon.ico');
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

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

  const pngBuffers = await Promise.all(
    ICO_SIZES.map((size) => sharp(svg).resize(size, size).png().toBuffer()),
  );
  const icoBuffer = await toIco(pngBuffers);
  fs.writeFileSync(icoPath, icoBuffer);
  console.log('Generated:', icoPath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
