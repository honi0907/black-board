const { autoUpdater } = require('electron-updater');
const { app, dialog } = require('electron');

let startupCheckDone = false;
let downloading = false;

function setupAutoUpdater(mainWindow) {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('error', (err) => {
    downloading = false;
    console.error('[updater]', err.message || err);
  });

  autoUpdater.on('update-downloaded', () => {
    downloading = false;
    autoUpdater.quitAndInstall(false, true);
  });

  autoUpdater.on('update-available', async (info) => {
    if (!mainWindow || downloading) return;

    const result = await dialog.showMessageBox(mainWindow, {
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
        console.error('[updater] download failed:', err.message || err);
      });
    }
  });

  checkOnStartup();
}

async function checkOnStartup() {
  if (startupCheckDone || !app.isPackaged) return;
  startupCheckDone = true;

  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    console.error('[updater] check failed:', err.message || err);
  }
}

module.exports = { setupAutoUpdater };
