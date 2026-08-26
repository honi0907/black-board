const express = require('express');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Server } = require('socket.io');

const DEFAULT_PORT = Number(process.env.PORT) || 3000;
const MAX_MESSAGES = 200;

function getLanIps() {
  const nets = os.networkInterfaces();
  const lanIps = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        lanIps.push(net.address);
      }
    }
  }
  return lanIps;
}

function printStartupInfo(port, lanIps) {
  console.log('');
  console.log('  Black Board サーバー起動');
  console.log(`  この PC（ホスト）: http://localhost:${port}`);
  console.log('');

  if (lanIps.length) {
    console.log('  他の人（スレーブ）はブラウザで次の URL を開いてください:');
    lanIps.forEach((ip) => console.log(`    http://${ip}:${port}`));
  } else {
    console.log('  他の人はホスト PC の IP アドレスで接続してください。');
  }

  console.log('');
  console.log('  終了: このウィンドウを閉じるか Ctrl+C');
  console.log('');
}

function startServer(options = {}) {
  const rootDir = options.rootDir || __dirname;
  const uploadDir = options.uploadDir || path.join(rootDir, 'uploads');
  const publicDir = options.publicDir || path.join(rootDir, 'public');
  const port = options.port || DEFAULT_PORT;

  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);

  const storage = multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    },
  });

  const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, allowed.includes(ext));
    },
  });

  const messages = [];
  const onlineUsers = new Map();

  app.use(express.static(publicDir));
  app.use('/uploads', express.static(uploadDir));

  app.post('/upload', upload.single('image'), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: '画像ファイルを選択してください（JPG, PNG, GIF, WebP / 最大5MB）' });
    }
    res.json({ url: `/uploads/${req.file.filename}` });
  });

  io.on('connection', (socket) => {
    socket.on('join', (username) => {
      const name = (username || 'ゲスト').trim().slice(0, 20) || 'ゲスト';
      onlineUsers.set(socket.id, name);

      socket.emit('history', messages);
      socket.emit('users', Array.from(onlineUsers.values()));
      io.emit('users', Array.from(onlineUsers.values()));
      io.emit('system', { text: `${name} が参加しました`, time: Date.now() });
    });

    socket.on('message', (data) => {
      const username = onlineUsers.get(socket.id) || 'ゲスト';
      const msg = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        username,
        text: (data.text || '').trim().slice(0, 2000),
        imageUrl: data.imageUrl || null,
        time: Date.now(),
      };

      if (!msg.text && !msg.imageUrl) return;

      messages.push(msg);
      if (messages.length > MAX_MESSAGES) messages.shift();

      io.emit('message', msg);
    });

    socket.on('disconnect', () => {
      const username = onlineUsers.get(socket.id);
      onlineUsers.delete(socket.id);
      io.emit('users', Array.from(onlineUsers.values()));
      if (username) {
        io.emit('system', { text: `${username} が退出しました`, time: Date.now() });
      }
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      const lanIps = getLanIps();
      resolve({ server, port, lanIps, uploadDir });
    });
  });
}

if (require.main === module) {
  startServer()
    .then(({ port, lanIps }) => printStartupInfo(port, lanIps))
    .catch((err) => {
      console.error('サーバー起動に失敗しました:', err.message);
      process.exit(1);
    });
}

module.exports = { startServer, getLanIps, printStartupInfo };
