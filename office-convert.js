const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const OFFICE_EXT = new Set(['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx']);
const CONVERT_TIMEOUT_MS = 90000;

let cachedSofficePath = undefined;

function isOfficeExt(ext) {
  return OFFICE_EXT.has(String(ext || '').toLowerCase());
}

function getBundledCandidates() {
  const candidates = [];

  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'LibreOffice', 'program', 'soffice.exe'));
  }

  candidates.push(path.join(__dirname, 'build', 'libreoffice', 'staging', 'program', 'soffice.exe'));

  if (process.env.LIBREOFFICE_PATH) {
    candidates.push(process.env.LIBREOFFICE_PATH);
  }

  return candidates;
}

function getSystemCandidates() {
  if (process.platform === 'win32') {
    const roots = [
      process.env.PROGRAMFILES,
      process.env['PROGRAMFILES(X86)'],
      'C:\\Program Files',
      'C:\\Program Files (x86)',
    ].filter(Boolean);

    return roots.map((root) => path.join(root, 'LibreOffice', 'program', 'soffice.exe'));
  }
  return ['soffice', 'libreoffice'];
}

function findSofficePath() {
  if (cachedSofficePath !== undefined) return cachedSofficePath;

  for (const candidate of getBundledCandidates()) {
    if (path.isAbsolute(candidate) && fs.existsSync(candidate)) {
      cachedSofficePath = candidate;
      return cachedSofficePath;
    }
  }

  for (const candidate of getSystemCandidates()) {
    if (path.isAbsolute(candidate) && fs.existsSync(candidate)) {
      cachedSofficePath = candidate;
      return cachedSofficePath;
    }
  }

  cachedSofficePath = null;
  return null;
}

function convertOfficeToPdf(inputPath, outputDir) {
  return new Promise((resolve) => {
    const soffice = findSofficePath();
    if (!soffice) {
      resolve(null);
      return;
    }

    const args = [
      '--headless',
      '--norestore',
      '--nolockcheck',
      '--nodefault',
      '--nofirststartwizard',
      '--convert-to',
      'pdf',
      '--outdir',
      outputDir,
      inputPath,
    ];

    const proc = spawn(soffice, args, {
      cwd: path.dirname(soffice),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      console.error('[office-convert] timed out:', path.basename(inputPath));
      resolve(null);
    }, CONVERT_TIMEOUT_MS);

    proc.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      console.error('[office-convert]', err.message);
      resolve(null);
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        console.error('[office-convert]', stderr.trim() || `exit code ${code}`);
        resolve(null);
        return;
      }

      const base = path.basename(inputPath, path.extname(inputPath));
      const generated = path.join(outputDir, `${base}.pdf`);
      resolve(fs.existsSync(generated) ? generated : null);
    });
  });
}

async function createOfficePreview(inputPath, uploadDir) {
  const ext = path.extname(inputPath).toLowerCase();
  if (!isOfficeExt(ext)) return null;

  const generated = await convertOfficeToPdf(inputPath, uploadDir);
  if (!generated) return null;

  const previewName = `${path.basename(inputPath, ext)}.preview.pdf`;
  const previewPath = path.join(uploadDir, previewName);

  try {
    if (generated !== previewPath) {
      if (fs.existsSync(previewPath)) fs.unlinkSync(previewPath);
      fs.renameSync(generated, previewPath);
    }
    return previewName;
  } catch (err) {
    console.error('[office-convert] rename failed:', err.message);
    try {
      if (fs.existsSync(generated)) fs.unlinkSync(generated);
    } catch (_ignored) {
      // ignore
    }
    return null;
  }
}

module.exports = {
  isOfficeExt,
  findSofficePath,
  createOfficePreview,
};
