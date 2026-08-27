const express = require('express');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Server } = require('socket.io');
const { isOfficeExt, createOfficePreview } = require('./office-convert');

const DEFAULT_PORT = Number(process.env.PORT) || 3000;
const MAX_BOARD_ITEMS = 150;
const AUTOSAVE_DELAY_MS = 2000;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
const ALLOWED_FILE_EXT = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.csv', '.md', '.json', '.zip', '.rar', '.7z',
  '.mp3', '.mp4', '.wav', '.webm', '.ogg',
]);

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
  const dataDir = options.dataDir || path.join(rootDir, 'data');
  const port = options.port || DEFAULT_PORT;
  const boardsFilePath = path.join(dataDir, 'boards.json');

  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    maxHttpBufferSize: 10 * 1024 * 1024,
  });

  const storage = multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    },
  });

  const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const allowed = ALLOWED_IMAGE_EXT.has(ext) || ALLOWED_FILE_EXT.has(ext);
      cb(null, allowed);
    },
  });

  const boards = new Map();
  let boardOrder = [];
  let activeBoardId = null;
  let lastSavedAt = null;
  let autosaveTimer = null;
  const userMeta = new Map();

  const NOTE_USER_PALETTE = [
    '#fef3c7', '#bfdbfe', '#bbf7d0', '#fecaca',
    '#e9d5ff', '#fed7aa', '#a5f3fc', '#fce7f3',
  ];

  function createDefaultBoard(name = 'ボード 1') {
    const id = `board-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    return { id, name, items: [] };
  }

  function getBoardItems(boardId) {
    return boards.get(boardId)?.items || [];
  }

  function getBoardsListPayload() {
    return {
      boards: boardOrder.map((id) => {
        const b = boards.get(id);
        return { id, name: b?.name || id };
      }),
      activeBoardId,
      lastSavedAt,
    };
  }

  function loadBoardsFromDisk() {
    try {
      if (fs.existsSync(boardsFilePath)) {
        const raw = fs.readFileSync(boardsFilePath, 'utf8');
        const data = JSON.parse(raw);
        boardOrder = Array.isArray(data.boardOrder) ? data.boardOrder : [];
        boards.clear();
        const stored = data.boards || {};
        for (const id of boardOrder) {
          const entry = stored[id];
          if (entry) {
            boards.set(id, {
              id,
              name: String(entry.name || id).slice(0, 40),
              items: Array.isArray(entry.items) ? entry.items : [],
            });
          }
        }
        activeBoardId = data.activeBoardId && boards.has(data.activeBoardId)
          ? data.activeBoardId
          : boardOrder[0] || null;
        lastSavedAt = data.savedAt || null;
      }
    } catch (err) {
      console.error('ボードデータの読み込みに失敗:', err.message);
    }

    if (!boards.size) {
      const def = createDefaultBoard('ボード 1');
      boards.set(def.id, def);
      boardOrder = [def.id];
      activeBoardId = def.id;
    } else if (!activeBoardId || !boards.has(activeBoardId)) {
      activeBoardId = boardOrder[0];
    }
  }

  function saveBoardsToDisk() {
    try {
      const payload = {
        version: 1,
        boardOrder,
        activeBoardId,
        boards: Object.fromEntries(
          [...boards.entries()].map(([id, b]) => [id, { id, name: b.name, items: b.items }]),
        ),
        savedAt: Date.now(),
      };
      fs.writeFileSync(boardsFilePath, JSON.stringify(payload, null, 2), 'utf8');
      lastSavedAt = payload.savedAt;
      io.emit('boards:saved', { savedAt: lastSavedAt });
      return lastSavedAt;
    } catch (err) {
      console.error('ボードデータの保存に失敗:', err.message);
      return null;
    }
  }

  function scheduleAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      saveBoardsToDisk();
    }, AUTOSAVE_DELAY_MS);
  }

  function touchBoard(boardId) {
    const board = boards.get(boardId);
    if (board) board.updatedAt = Date.now();
    scheduleAutosave();
  }

  function joinAllSocketsToBoard(boardId) {
    io.sockets.sockets.forEach((s) => {
      boardOrder.forEach((id) => s.leave(id));
      s.join(boardId);
      const meta = userMeta.get(s.id);
      if (meta) meta.boardId = boardId;
    });
  }

  function broadcastBoardSwitch(boardId) {
    const items = getBoardItems(boardId);
    io.emit('board:switch', { boardId, items });
    io.emit('boards:list', getBoardsListPayload());
  }

  loadBoardsFromDisk();

  function assignNoteColor() {
    const used = new Set([...userMeta.values()].map((u) => u.noteColor));
    for (const color of NOTE_USER_PALETTE) {
      if (!used.has(color)) return color;
    }
    return NOTE_USER_PALETTE[userMeta.size % NOTE_USER_PALETTE.length];
  }

  function buildUsersPayload() {
    return {
      count: userMeta.size,
      members: [...userMeta.entries()].map(([id, u]) => ({
        id,
        username: u.username,
        noteColor: u.noteColor,
      })),
    };
  }

  function getUsername(socketId) {
    return userMeta.get(socketId)?.username || 'ゲスト';
  }

  function getActiveBoardId(socketId) {
    return userMeta.get(socketId)?.boardId || activeBoardId;
  }

  let listeningPort = port;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeHexColor(color, fallback = '#ffffff') {
    const c = String(color || '').trim().toLowerCase();
    return /^#[0-9a-f]{6}$/.test(c) ? c : fallback;
  }

  function createStroke(data, username) {
    const points = (data.points || [])
      .slice(0, 1000)
      .map((p) => [Math.max(0, Number(p[0]) || 0), Math.max(0, Number(p[1]) || 0)]);
    if (points.length < 2) return null;

    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: 'stroke',
      username,
      tool: data.tool === 'eraser' ? 'eraser' : 'pen',
      color: normalizeHexColor(data.color, '#ffffff'),
      width: clamp(Number(data.width) || 4, 1, 24),
      points,
      time: Date.now(),
    };
  }

  function isPdfAttachment(data) {
    if (data.mimeType === 'application/pdf') return true;
    const name = data.fileName || data.fileUrl || '';
    return /\.pdf$/i.test(name);
  }

  function hasInlinePreviewAttachment(data) {
    if (data.previewUrl) return true;
    return isPdfAttachment(data);
  }

  function createItem(data, username) {
    const item = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type: data.type,
      username,
      x: Math.max(0, Number(data.x) || 0),
      y: Math.max(0, Number(data.y) || 0),
      imageUrl: data.imageUrl || null,
      fileUrl: data.fileUrl || null,
      previewUrl: data.previewUrl ? String(data.previewUrl).slice(0, 200) : null,
      fileName: data.fileName ? String(data.fileName).slice(0, 120) : null,
      mimeType: data.mimeType ? String(data.mimeType).slice(0, 80) : null,
      text: data.text ? String(data.text).trim().slice(0, 200) : null,
      noteColor: data.type === 'text' ? normalizeHexColor(data.noteColor, '#fef3c7') : null,
      width: data.type === 'image'
        ? clamp(Number(data.width) || 280, 80, 900)
        : (data.type === 'file' && hasInlinePreviewAttachment(data))
          ? clamp(Number(data.width) || 320, 160, 900)
          : null,
      height: (data.type === 'file' && hasInlinePreviewAttachment(data))
        ? clamp(Number(data.height) || 420, 200, 900)
        : null,
      rotation: clamp(Number(data.rotation) || 0, -180, 180),
      time: Date.now(),
    };
    return item;
  }

  function isValidItem(item) {
    if (item.type === 'image') return !!item.imageUrl;
    if (item.type === 'file') return !!item.fileUrl && !!item.fileName;
    if (item.type === 'text') return !!item.text;
    return false;
  }

  function pushItem(boardId, item) {
    const items = getBoardItems(boardId);
    items.push(item);
    if (items.length > MAX_BOARD_ITEMS) items.shift();
    touchBoard(boardId);
    return item;
  }

  app.use(express.static(publicDir));
  app.use('/uploads', express.static(uploadDir));

  app.get('/api/info', (_req, res) => {
    const lanIps = getLanIps();
    res.json({
      port: listeningPort,
      lanIps,
      urls: lanIps.map((ip) => `http://${ip}:${listeningPort}`),
      localUrl: `http://localhost:${listeningPort}`,
    });
  });

  app.get('/api/boards/export', (_req, res) => {
    const payload = {
      version: 1,
      exportedAt: Date.now(),
      boardOrder,
      activeBoardId,
      boards: Object.fromEntries(
        [...boards.entries()].map(([id, b]) => [id, { id, name: b.name, items: b.items }]),
      ),
    };
    res.setHeader('Content-Disposition', 'attachment; filename="black-board-export.json"');
    res.json(payload);
  });

  app.post('/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        error: '対応ファイルを選択してください（画像 / PDF / Office / テキスト / ZIP など / 最大10MB）',
      });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    if (ALLOWED_IMAGE_EXT.has(ext) && req.file.size > MAX_IMAGE_SIZE) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: '画像は最大5MBまでです' });
    }

    const payload = {
      url: `/uploads/${req.file.filename}`,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype || 'application/octet-stream',
    };

    if (isOfficeExt(ext)) {
      const previewName = await createOfficePreview(req.file.path, uploadDir);
      if (previewName) {
        payload.previewUrl = `/uploads/${previewName}`;
      } else {
        payload.previewError = 'LibreOffice が見つからないか、変換に失敗しました';
      }
    }

    res.json(payload);
  });

  io.on('connection', (socket) => {
    socket.on('join', (username) => {
      const name = (username || 'ゲスト').trim().slice(0, 20) || 'ゲスト';
      const noteColor = assignNoteColor();
      const boardId = activeBoardId;
      userMeta.set(socket.id, { username: name, noteColor, boardId });
      socket.join(boardId);

      try {
        socket.emit('board:history', getBoardItems(boardId));
      } catch (err) {
        console.error('board:history の送信に失敗:', err.message);
        socket.emit('board:history', []);
      }

      socket.emit('boards:list', getBoardsListPayload());
      socket.emit('session', { noteColor, userId: socket.id });
      const usersPayload = buildUsersPayload();
      socket.emit('users', usersPayload);
      io.emit('users', usersPayload);
      io.emit('system', { text: `${name} が参加しました`, time: Date.now() });
    });

    socket.on('board:save', () => {
      const savedAt = saveBoardsToDisk();
      socket.emit('board:save-result', { ok: !!savedAt, savedAt });
    });

    socket.on('board:switch', (boardId) => {
      if (!boards.has(boardId) || boardId === activeBoardId) return;
      activeBoardId = boardId;
      joinAllSocketsToBoard(boardId);
      broadcastBoardSwitch(boardId);
    });

    socket.on('board:create', (name) => {
      const board = createDefaultBoard(
        String(name || '').trim().slice(0, 40) || `ボード ${boardOrder.length + 1}`,
      );
      boards.set(board.id, board);
      boardOrder.push(board.id);
      activeBoardId = board.id;
      joinAllSocketsToBoard(board.id);
      broadcastBoardSwitch(board.id);
      touchBoard(board.id);
    });

    socket.on('board:rename', (data) => {
      const board = boards.get(data?.id);
      if (!board) return;
      const newName = String(data.name || '').trim().slice(0, 40);
      if (!newName) return;
      board.name = newName;
      io.emit('boards:list', getBoardsListPayload());
      touchBoard(board.id);
    });

    socket.on('board:delete-tab', (boardId) => {
      if (boardOrder.length <= 1 || !boards.has(boardId)) return;
      boards.delete(boardId);
      boardOrder = boardOrder.filter((id) => id !== boardId);
      if (activeBoardId === boardId) {
        activeBoardId = boardOrder[0];
        joinAllSocketsToBoard(activeBoardId);
        broadcastBoardSwitch(activeBoardId);
      } else {
        io.emit('boards:list', getBoardsListPayload());
      }
      scheduleAutosave();
    });

    socket.on('board:add', (data) => {
      const boardId = getActiveBoardId(socket.id);
      const meta = userMeta.get(socket.id);
      const username = meta?.username || 'ゲスト';
      if (data.type === 'text' && !data.noteColor && meta?.noteColor) {
        data.noteColor = meta.noteColor;
      }
      const item = createItem(data, username);
      if (!isValidItem(item)) return;

      pushItem(boardId, item);
      io.to(boardId).emit('board:add', item);
    });

    socket.on('board:move', (data) => {
      const boardId = getActiveBoardId(socket.id);
      const item = getBoardItems(boardId).find((b) => b.id === data.id);
      if (!item) return;

      item.x = Math.max(0, Number(data.x) || 0);
      item.y = Math.max(0, Number(data.y) || 0);
      io.to(boardId).emit('board:update', {
        id: item.id,
        x: item.x,
        y: item.y,
        width: item.width,
        rotation: item.rotation,
      });
      touchBoard(boardId);
    });

    socket.on('board:update', (data) => {
      const boardId = getActiveBoardId(socket.id);
      const item = getBoardItems(boardId).find((b) => b.id === data.id);
      if (!item) return;

      if (data.x != null) item.x = Math.max(0, Number(data.x) || 0);
      if (data.y != null) item.y = Math.max(0, Number(data.y) || 0);
      if (item.type === 'image' && data.width != null) {
        item.width = clamp(Number(data.width) || item.width, 80, 900);
      }
      if (item.type === 'file' && hasInlinePreviewAttachment(item) && data.width != null) {
        item.width = clamp(Number(data.width) || item.width, 160, 900);
      }
      if (item.type === 'file' && hasInlinePreviewAttachment(item) && data.height != null) {
        item.height = clamp(Number(data.height) || item.height, 200, 900);
      }
      if (data.rotation != null) {
        item.rotation = clamp(Number(data.rotation) || 0, -180, 180);
      }
      if (item.type === 'text') {
        if (data.text != null) {
          const t = String(data.text).trim().slice(0, 200);
          if (t) item.text = t;
        }
        if (data.noteColor != null) {
          item.noteColor = normalizeHexColor(data.noteColor, item.noteColor || '#fef3c7');
        }
      }

      io.to(boardId).emit('board:update', {
        id: item.id,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        rotation: item.rotation,
        text: item.type === 'text' ? item.text : undefined,
        noteColor: item.type === 'text' ? item.noteColor : undefined,
      });
      touchBoard(boardId);
    });

    socket.on('board:stroke', (data) => {
      const boardId = getActiveBoardId(socket.id);
      const username = getUsername(socket.id);
      const stroke = createStroke(data, username);
      if (!stroke) return;

      const items = getBoardItems(boardId);
      items.push(stroke);
      let removed = null;
      if (items.length > MAX_BOARD_ITEMS) {
        removed = items.shift();
      }
      touchBoard(boardId);

      if (removed?.type === 'stroke') {
        io.to(boardId).emit('board:stroke-remove', { id: removed.id });
      }
      io.to(boardId).emit('board:stroke', stroke);
    });

    socket.on('board:delete', (data) => {
      const boardId = getActiveBoardId(socket.id);
      const items = getBoardItems(boardId);
      const index = items.findIndex((b) => b.id === data.id);
      if (index === -1) return;
      const removed = items[index];
      items.splice(index, 1);
      touchBoard(boardId);

      if (removed.type === 'stroke') {
        io.to(boardId).emit('board:stroke-remove', { id: removed.id });
      } else {
        io.to(boardId).emit('board:delete', { id: data.id });
      }
    });

    socket.on('disconnect', () => {
      const username = userMeta.get(socket.id)?.username;
      userMeta.delete(socket.id);
      io.emit('users', buildUsersPayload());
      if (username) {
        io.emit('system', { text: `${username} が退出しました`, time: Date.now() });
      }
    });
  });

  return listenWithFallback(server, port).then((actualPort) => {
    listeningPort = actualPort;
    const lanIps = getLanIps();
    console.log(`  ボードデータ: ${boardsFilePath}`);
    if (lastSavedAt) {
      console.log(`  前回保存: ${new Date(lastSavedAt).toLocaleString('ja-JP')}`);
    }
    return { server, io, port: actualPort, lanIps, uploadDir, dataDir };
  });
}

function listenWithFallback(server, startPort, maxAttempts = 10) {
  return new Promise((resolve, reject) => {
    let port = startPort;
    let attempts = 0;

    const tryListen = () => {
      const onError = (err) => {
        server.removeListener('listening', onListening);
        if (err.code === 'EADDRINUSE' && attempts < maxAttempts - 1) {
          attempts += 1;
          port += 1;
          tryListen();
          return;
        }
        reject(err);
      };

      const onListening = () => {
        server.removeListener('error', onError);
        if (port !== startPort) {
          console.log(`  ポート ${startPort} は使用中のため ${port} で起動しました`);
        }
        resolve(port);
      };

      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port);
    };

    tryListen();
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
