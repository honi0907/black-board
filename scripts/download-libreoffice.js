const { execSync } = require('child_process');
const fs = require('fs');
const https = require('https');
const path = require('path');

const VERSION = process.env.LIBREOFFICE_VERSION || '26.2.5';
const ROOT = path.join(__dirname, '..');
const BASE_DIR = path.join(ROOT, 'build', 'libreoffice');
const CACHE_DIR = path.join(BASE_DIR, 'cache');
const STAGING_DIR = path.join(BASE_DIR, 'staging');
const SOFFICE_PATH = path.join(STAGING_DIR, 'program', 'soffice.exe');
const MSI_NAME = `LibreOffice_${VERSION}_Win_x86-64.msi`;
const MSI_URL = `https://download.documentfoundation.org/libreoffice/stable/${VERSION}/win/x86_64/${MSI_NAME}`;

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const request = (currentUrl) => {
      https.get(currentUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          request(new URL(res.headers.location, currentUrl).href);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${res.statusCode} (${currentUrl})`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
      }).on('error', reject);
    };
    request(url);
  });
}

function resetDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

async function main() {
  if (process.platform !== 'win32') {
    console.log('[libreoffice] Windows 以外ではスキップします');
    return;
  }

  if (fs.existsSync(SOFFICE_PATH)) {
    console.log('[libreoffice] 同梱済み:', SOFFICE_PATH);
    return;
  }

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const msiPath = path.join(CACHE_DIR, MSI_NAME);

  if (!fs.existsSync(msiPath)) {
    console.log(`[libreoffice] ダウンロード中: ${MSI_URL}`);
    console.log('[libreoffice] 約 350MB あるため数分かかります…');
    await downloadFile(MSI_URL, msiPath);
  }

  resetDir(STAGING_DIR);

  console.log('[libreoffice] 展開中…');
  execSync(
    `msiexec /a "${msiPath}" /qn TARGETDIR="${STAGING_DIR}"`,
    { stdio: 'inherit' },
  );

  if (!fs.existsSync(SOFFICE_PATH)) {
    throw new Error(`LibreOffice の展開に失敗しました: ${SOFFICE_PATH} が見つかりません`);
  }

  console.log('[libreoffice] 準備完了:', SOFFICE_PATH);
}

main().catch((err) => {
  console.error('[libreoffice]', err.message);
  process.exit(1);
});
