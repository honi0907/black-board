const { app, BrowserWindow, dialog, Menu, ipcMain, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { startServer } = require('../server');
const { setupAutoUpdater } = require('./updater');
const { resolveAppIconPath } = require('./icon-path');

let mainWindow = null;
let httpServer = null;
let ioServer = null;
let serverPort = null;
let lanIps = [];
let uploadDir = null;
function getPaths() {
  const rootDir = path.join(__dirname, '..');
  const publicDir = path.join(rootDir, 'public');
  const userData = app.getPath('userData');
  const uploadDir = path.join(userData, 'uploads');
  const dataDir = path.join(userData, 'data');
  return { rootDir, publicDir, uploadDir, dataDir };
}

function buildInviteText() {
  const lines = [`この PC: http://localhost:${serverPort}`];
  lanIps.forEach((ip) => lines.push(`他の人: http://${ip}:${serverPort}`));
  return lines.join('\n');
}

function createWindow() {
  const iconPath = resolveAppIconPath();
  mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 360,
    minHeight: 480,
    title: 'Black Board',
    icon: iconPath || undefined,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload-host.js'),
    },
  });

  const menu = Menu.buildFromTemplate([
    {
      label: 'Black Board',
      submenu: [
        {
          label: '接続 URL を表示',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: '接続 URL',
              message: '他の人（スレーブ）はブラウザで次の URL を開いてください',
              detail: buildInviteText(),
            });
          },
        },
        { type: 'separator' },
        { role: 'quit', label: '終了' },
      ],
    },
    {
      label: '表示',
      submenu: [
        { role: 'reload', label: '再読み込み' },
        { role: 'toggleDevTools', label: '開発者ツール' },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);

  mainWindow.loadURL(`http://localhost:${serverPort}`);

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file://')) event.preventDefault();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => {
    setupAutoUpdater(mainWindow, { onBeforeInstall: stopServer });
  });
}

async function startApp() {
  const paths = getPaths();
  uploadDir = paths.uploadDir;

  try {
    const info = await startServer({
      rootDir: paths.rootDir,
      publicDir: paths.publicDir,
      uploadDir: paths.uploadDir,
      dataDir: paths.dataDir,
    });
    httpServer = info.server;
    ioServer = info.io;
    serverPort = info.port;
    lanIps = info.lanIps;
    createWindow();
  } catch (err) {
    dialog.showErrorBox('Black Board', `サーバー起動に失敗しました:\n${err.message}`);
    app.quit();
  }
}

function stopServer() {
  if (ioServer) {
    try {
      ioServer.close();
    } catch (_err) {
      // ignore
    }
    ioServer = null;
  }
  if (httpServer) {
    try {
      if (typeof httpServer.closeAllConnections === 'function') {
        httpServer.closeAllConnections();
      }
      httpServer.close();
    } catch (_err) {
      // ignore
    }
    httpServer = null;
  }
}

app.whenReady().then(startApp);

if (process.platform === 'win32') {
  app.setAppUserModelId('com.blackboard.chat');
}

ipcMain.handle('app:get-version', () => app.getVersion());

ipcMain.on('ondragstart', (event, imageUrl) => {
  if (!uploadDir || !imageUrl || !imageUrl.startsWith('/uploads/')) return;

  const filename = path.basename(imageUrl);
  const filePath = path.join(uploadDir, filename);
  if (!fs.existsSync(filePath)) return;

  let icon = nativeImage.createFromPath(filePath);
  if (icon.isEmpty()) {
    icon = nativeImage.createEmpty();
  }

  event.sender.startDrag({ file: filePath, icon });
});

app.on('window-all-closed', () => {
  stopServer();
  app.quit();
});

app.on('before-quit', stopServer);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0 && serverPort) {
    createWindow();
  }
});
