const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const { app, dialog, BrowserWindow, shell } = require('electron');

let startupCheckDone = false;
let downloading = false;
let installing = false;
let errorShown = false;
let mainWindowRef = null;
let progressWin = null;
let onBeforeInstall = null;

function setupAutoUpdater(mainWindow, options = {}) {
  if (!app.isPackaged) return;

  mainWindowRef = mainWindow;
  onBeforeInstall = typeof options.onBeforeInstall === 'function' ? options.onBeforeInstall : null;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.autoRunAppAfterInstall = true;
  autoUpdater.disableDifferentialDownload = true;
  autoUpdater.disableWebInstaller = true;
  autoUpdater.logger = console;

  autoUpdater.on('error', (err) => {
    const message = err?.message || String(err);
    console.error('[updater]', message);
    if (downloading || installing) {
      showUpdateError(message);
    }
  });

  autoUpdater.on('download-progress', (progress) => {
    const percent = Number(progress?.percent) || 0;
    const transferred = formatBytes(progress?.transferred);
    const total = formatBytes(progress?.total);
    const speed = formatBytes(progress?.bytesPerSecond);
    const detailParts = [];
    if (transferred && total) detailParts.push(`${transferred} / ${total}`);
    else if (transferred) detailParts.push(transferred);
    if (speed) detailParts.push(`${speed}/s`);

    setTaskbarProgress(percent);
    updateProgress({
      status: 'インストーラーをダウンロードしています…',
      percent,
      detail: detailParts.join('  ·  ') || 'ダウンロード中',
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    downloading = false;
    const downloadedFile = info?.downloadedFile || autoUpdater.downloadedUpdateHelper?.file;
    launchInstaller(downloadedFile);
  });

  autoUpdater.on('update-available', async (info) => {
    const win = mainWindowRef;
    if (!win || win.isDestroyed() || downloading || installing) return;

    const result = await dialog.showMessageBox(win, {
      type: 'info',
      title: 'アップデート',
      message: '新しいバージョンがあります',
      detail: `バージョン ${info.version} が利用可能です。\n今すぐダウンロードしてインストールしますか？`,
      buttons: ['はい', 'いいえ'],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });

    if (result.response !== 0) return;

    downloading = true;
    errorShown = false;
    try {
      await openProgressWindow();
      updateProgress({
        status: 'インストーラーをダウンロードしています…',
        percent: 0,
        detail: `バージョン ${info.version}`,
      });
      await autoUpdater.downloadUpdate();
    } catch (err) {
      showUpdateError(err?.message || err);
    }
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[updater] 最新バージョンです');
  });

  checkOnStartup();
}

function formatBytes(n) {
  const value = Number(n);
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function setTaskbarProgress(percent) {
  const win = mainWindowRef;
  if (!win || win.isDestroyed()) return;
  if (percent == null || percent < 0) {
    win.setProgressBar(-1);
    return;
  }
  win.setProgressBar(Math.min(1, Math.max(0, percent / 100)));
}

function openProgressWindow() {
  if (progressWin && !progressWin.isDestroyed()) {
    return Promise.resolve(progressWin);
  }

  const parent = mainWindowRef && !mainWindowRef.isDestroyed() ? mainWindowRef : undefined;
  progressWin = new BrowserWindow({
    parent,
    modal: Boolean(parent),
    width: 440,
    height: 180,
    resizable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    autoHideMenuBar: true,
    show: false,
    title: 'アップデート',
    backgroundColor: '#0f1419',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });

  progressWin.setMenu(null);

  return progressWin.loadFile(path.join(__dirname, 'update-progress.html')).then(() => {
    if (progressWin && !progressWin.isDestroyed()) {
      progressWin.show();
    }
    return progressWin;
  });
}

function updateProgress(payload) {
  if (!progressWin || progressWin.isDestroyed()) return;
  const script = `window.updateProgress && window.updateProgress(${JSON.stringify(payload)})`;
  progressWin.webContents.executeJavaScript(script).catch(() => {});
}

function closeProgressWindow() {
  setTaskbarProgress(-1);
  if (progressWin && !progressWin.isDestroyed()) {
    progressWin.destroy();
  }
  progressWin = null;
}

function showUpdateError(message) {
  downloading = false;
  installing = false;
  if (errorShown) return;
  errorShown = true;
  closeProgressWindow();
  const win = mainWindowRef && !mainWindowRef.isDestroyed() ? mainWindowRef : undefined;
  const box = {
    type: 'error',
    title: 'アップデート',
    message: 'アップデートに失敗しました',
    detail: String(message || '不明なエラーです'),
  };
  if (win) {
    dialog.showMessageBox(win, box);
  } else {
    dialog.showErrorBox(box.title, `${box.message}\n${box.detail}`);
  }
}

function launchInstaller(downloadedFile) {
  if (installing) return;
  installing = true;

  if (!downloadedFile || !fs.existsSync(downloadedFile)) {
    showUpdateError('ダウンロードしたインストーラーが見つかりません。');
    return;
  }

  updateProgress({
    status: 'インストーラーを起動しています…',
    percent: 100,
    detail: 'アプリを終了してインストールを開始します',
  });
  setTaskbarProgress(100);

  setTimeout(() => {
    closeProgressWindow();

    try {
      if (onBeforeInstall) onBeforeInstall();
    } catch (err) {
      console.error('[updater] onBeforeInstall failed:', err);
    }

    let exited = false;
    const exitApp = () => {
      if (exited) return;
      exited = true;
      app.exit(0);
    };

    const child = spawn(downloadedFile, ['--updated', '--force-run'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });

    const fallbackExit = setTimeout(exitApp, 2500);

    child.once('error', (err) => {
      clearTimeout(fallbackExit);
      console.error('[updater] spawn failed:', err);
      shell.openPath(downloadedFile).then((openError) => {
        if (openError) {
          showUpdateError(openError || err.message);
          return;
        }
        setTimeout(exitApp, 400);
      });
    });

    child.once('spawn', () => {
      clearTimeout(fallbackExit);
      setTimeout(exitApp, 400);
    });

    child.unref();
  }, 350);
}

async function checkOnStartup() {
  if (startupCheckDone || !app.isPackaged) return;
  startupCheckDone = true;

  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    console.error('[updater] check failed:', err?.message || err);
  }
}

module.exports = { setupAutoUpdater };
