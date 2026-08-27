const { app, BrowserWindow, dialog, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let isOnChat = false;

function getLastUrlPath() {
  return path.join(app.getPath('userData'), 'last-server.json');
}

function readLastUrl() {
  try {
    const data = JSON.parse(fs.readFileSync(getLastUrlPath(), 'utf8'));
    return data.url || '';
  } catch {
    return '';
  }
}

function saveLastUrl(url) {
  fs.writeFileSync(getLastUrlPath(), JSON.stringify({ url }), 'utf8');
}

function normalizeUrl(raw) {
  let url = raw.trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) {
    url = `http://${url}`;
  }
  return url.replace(/\/+$/, '');
}

function createMenu() {
  const template = [
    {
      label: 'Black Board',
      submenu: [
        {
          label: '接続先を変更',
          click: () => showConnectScreen(),
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
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const iconPath = path.join(__dirname, '..', 'build', 'icon.png');
  mainWindow = new BrowserWindow({
    width: 960,
    height: 720,
    minWidth: 360,
    minHeight: 480,
    title: 'Black Board Connect',
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload-connect.js'),
    },
  });

  createMenu();

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    if (!isOnChat) return;
    dialog.showErrorBox(
      'Black Board',
      `接続に失敗しました:\n${description}\n\nURL: ${url}\n\nホストが起動しているか、URL が正しいか確認してください。`
    );
    showConnectScreen();
  });
}

function showConnectScreen() {
  isOnChat = false;
  mainWindow.setTitle('Black Board - 接続');
  mainWindow.loadFile(path.join(__dirname, '..', 'public', 'connect.html'));
}

async function connectToHost(rawUrl) {
  const url = normalizeUrl(rawUrl);
  if (!url) {
    dialog.showErrorBox('Black Board', 'URL を入力してください');
    return;
  }

  saveLastUrl(url);
  isOnChat = true;
  mainWindow.setTitle('Black Board');
  await mainWindow.loadURL(`${url}/`);
}

function setupIpc() {
  ipcMain.handle('get-last-url', () => readLastUrl());

  ipcMain.on('connect', (_event, rawUrl) => {
    connectToHost(rawUrl).catch((err) => {
      dialog.showErrorBox('Black Board', `接続に失敗しました:\n${err.message}`);
      showConnectScreen();
    });
  });
}

app.whenReady().then(() => {
  setupIpc();
  createWindow();
  showConnectScreen();
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
    showConnectScreen();
  }
});
