const { app, BrowserWindow, dialog, Menu } = require('electron');
const path = require('path');
const { startServer } = require('../server');

let mainWindow = null;
let httpServer = null;
let serverPort = null;
let lanIps = [];

function getPaths() {
  const rootDir = path.join(__dirname, '..');
  const publicDir = path.join(rootDir, 'public');
  const uploadDir = path.join(app.getPath('userData'), 'uploads');
  return { rootDir, publicDir, uploadDir };
}

function buildInviteText() {
  const lines = [`この PC: http://localhost:${serverPort}`];
  lanIps.forEach((ip) => lines.push(`他の人: http://${ip}:${serverPort}`));
  return lines.join('\n');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 360,
    minHeight: 480,
    title: 'Black Board',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
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

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });
}

async function startApp() {
  const { rootDir, publicDir, uploadDir } = getPaths();

  try {
    const info = await startServer({ rootDir, publicDir, uploadDir });
    httpServer = info.server;
    serverPort = info.port;
    lanIps = info.lanIps;
    createWindow();
  } catch (err) {
    dialog.showErrorBox('Black Board', `サーバー起動に失敗しました:\n${err.message}`);
    app.quit();
  }
}

function stopServer() {
  if (httpServer) {
    httpServer.close();
    httpServer = null;
  }
}

app.whenReady().then(startApp);

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
