const { autoUpdater } = require('electron-updater');
const { app, dialog } = require('electron');

let startupCheckDone = false;
let downloading = false;
let mainWindowRef = null;

function setupAutoUpdater(mainWindow) {
  if (!app.isPackaged) return;

  mainWindowRef = mainWindow;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.autoRunAppAfterInstall = true;

  autoUpdater.on('error', (err) => {
    downloading = false;
    console.error('[updater]', err?.message || err);
  });

  autoUpdater.on('update-downloaded', () => {
    downloading = false;
    autoUpdater.quitAndInstall(false, true);
  });

  autoUpdater.on('update-available', async (info) => {
    const win = mainWindowRef;
    if (!win || win.isDestroyed() || downloading) return;

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

    if (result.response === 0) {
      downloading = true;
      autoUpdater.downloadUpdate().catch((err) => {
        downloading = false;
        console.error('[updater] download failed:', err?.message || err);
      });
    }
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[updater] 最新バージョンです');
  });

  checkOnStartup();
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
