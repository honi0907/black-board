const loginScreen = document.getElementById('login-screen');
const boardScreen = document.getElementById('board-screen');
const usernameInput = document.getElementById('username-input');
const joinBtn = document.getElementById('join-btn');
const board = document.getElementById('board');
const boardWrap = document.getElementById('board-wrap');
const boardEmpty = document.getElementById('board-empty');
const fileInput = document.getElementById('file-input');
const addImageBtn = document.getElementById('add-image-btn');
const noteForm = document.getElementById('note-form');
const noteInput = document.getElementById('note-input');
const noteFormColorBtn = document.getElementById('note-form-color-btn');
const onlineCount = document.getElementById('online-count');
const hostInfo = document.getElementById('host-info');
const hostUrls = document.getElementById('host-urls');
const hostInfoLogin = document.getElementById('host-info-login');
const hostUrlsLogin = document.getElementById('host-urls-login');
const toast = document.getElementById('toast');
const saveBtn = document.getElementById('save-btn');
const exportBtn = document.getElementById('export-btn');
const saveStatus = document.getElementById('save-status');
const boardTabsList = document.getElementById('board-tabs-list');
const boardTabAdd = document.getElementById('board-tab-add');

let socket = null;
let drawReady = false;
let currentBoardId = null;
let boardTabs = [];
let lastSavedAt = null;

function showBoardScreen() {
  loginScreen?.classList.add('hidden');
  boardScreen?.classList.remove('hidden');
}

function loadBoardFromItems(items) {
  board?.querySelectorAll('.board-item').forEach((el) => el.remove());
  itemElements.clear();
  itemData.clear();
  (items || []).filter((i) => i.type !== 'stroke').forEach(addItemToBoard);
  window.drawModule?.loadStrokesFromHistory(items || []);
  updateEmptyState();
}

function formatSaveTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function updateSaveStatus(state) {
  if (!saveStatus) return;
  saveStatus.classList.remove('saving', 'saved');
  if (state === 'saving') {
    saveStatus.textContent = '保存中…';
    saveStatus.classList.add('saving');
  } else if (state === 'saved' && lastSavedAt) {
    saveStatus.textContent = `一時保存 ${formatSaveTime(lastSavedAt)}`;
    saveStatus.classList.add('saved');
  } else if (lastSavedAt) {
    saveStatus.textContent = `保存済 ${formatSaveTime(lastSavedAt)}`;
  } else {
    saveStatus.textContent = '';
  }
}

function renderBoardTabs() {
  if (!boardTabsList) return;
  boardTabsList.innerHTML = '';
  boardTabs.forEach((tab) => {
    const el = document.createElement('div');
    el.className = `board-tab${tab.id === currentBoardId ? ' active' : ''}`;
    el.dataset.boardId = tab.id;
    el.setAttribute('role', 'tab');
    el.tabIndex = 0;

    el.title = 'クリックで切り替え · ダブルクリックで名前変更';

    const label = document.createElement('span');
    label.className = 'board-tab-label';
    label.textContent = tab.name;
    label.title = 'ダブルクリックで名前変更';

    el.appendChild(label);

    if (boardTabs.length > 1) {
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'board-tab-close';
      closeBtn.textContent = '×';
      closeBtn.title = 'ボードを閉じる';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (socket?.connected) socket.emit('board:delete-tab', tab.id);
      });
      el.appendChild(closeBtn);
    }

    el.addEventListener('click', (e) => {
      if (e.target.closest('.board-tab-close')) return;
      if (tab.id !== currentBoardId && socket?.connected) {
        socket.emit('board:switch', tab.id);
      }
    });

    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (tab.id !== currentBoardId && socket?.connected) {
          socket.emit('board:switch', tab.id);
        }
      }
    });

    el.addEventListener('dblclick', (e) => {
      if (e.target.closest('.board-tab-close')) return;
      e.preventDefault();
      e.stopPropagation();
      startTabRename(tab, label);
    });

    boardTabsList.appendChild(el);
  });
}

function startTabRename(tab, labelEl) {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = tab.name;
  input.maxLength = 40;
  input.className = 'board-tab-rename-input';
  labelEl.replaceWith(input);
  input.focus();
  input.select();

  let committed = false;
  const commit = () => {
    if (committed) return;
    committed = true;
    const name = input.value.trim() || tab.name;
    if (socket?.connected && name !== tab.name) {
      const entry = boardTabs.find((b) => b.id === tab.id);
      if (entry) entry.name = name;
      socket.emit('board:rename', { id: tab.id, name });
    }
    renderBoardTabs();
  };

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      input.blur();
    }
    if (ev.key === 'Escape') {
      ev.preventDefault();
      committed = true;
      renderBoardTabs();
    }
  });
}

function setupSocketHandlers(username) {
  socket.on('connect', () => {
    socket.emit('join', username);
  });

  socket.on('connect_error', () => {
    if (joinBtn) joinBtn.disabled = false;
    showToast('サーバーに接続できません。アプリを再起動してください');
  });

  socket.on('board:history', (items) => {
    if (joinBtn) joinBtn.disabled = false;
    loadBoardFromItems(items);
  });

  socket.on('board:switch', ({ boardId, items }) => {
    currentBoardId = boardId;
    loadBoardFromItems(items);
    renderBoardTabs();
  });

  socket.on('boards:list', (data) => {
    boardTabs = data?.boards || [];
    currentBoardId = data?.activeBoardId || currentBoardId;
    if (data?.lastSavedAt) lastSavedAt = data.lastSavedAt;
    renderBoardTabs();
    updateSaveStatus('saved');
  });

  socket.on('boards:saved', ({ savedAt }) => {
    lastSavedAt = savedAt;
    updateSaveStatus('saved');
  });

  socket.on('board:save-result', ({ ok, savedAt }) => {
    if (ok) {
      lastSavedAt = savedAt;
      updateSaveStatus('saved');
      showToast('ボードを保存しました');
    } else {
      showToast('保存に失敗しました');
    }
  });

  socket.on('board:add', addItemToBoard);
  socket.on('board:move', moveItemOnBoard);
  socket.on('board:update', updateItemOnBoard);
  socket.on('board:delete', (data) => removeItemFromBoard(data.id));
  socket.on('board:stroke', (stroke) => {
    window.drawModule?.addStroke(stroke);
    updateEmptyState();
  });
  socket.on('board:stroke-remove', (data) => {
    window.drawModule?.removeStroke(data.id);
    updateEmptyState();
  });

  socket.on('system', (msg) => {
    showToast(msg.text);
  });

  socket.on('users', (data) => {
    const count = Array.isArray(data) ? data.length : (data?.count ?? 0);
    if (onlineCount) onlineCount.textContent = `${count} 人`;
  });

  socket.on('session', ({ noteColor }) => {
    if (noteColor) {
      myNoteColor = noteColor;
      pendingNoteColor = noteColor;
      updateFormNoteColorBtn();
      if (noteFormColorBtn) {
        noteFormColorBtn.title = 'あなたの色（ダブルクリックで変更）';
      }
    }
  });
}

function joinBoard() {
  try {
    if (typeof io !== 'function') {
      showToast('接続モジュールの読み込みに失敗しました。再読み込みしてください');
      return;
    }

    const username = usernameInput?.value.trim() || 'ゲスト';
    currentUsername = username;

    showBoardScreen();
    if (joinBtn) joinBtn.disabled = true;
    setupDropZone();

    if (!drawReady) {
      window.drawModule?.initDrawing(null);
      drawReady = true;
    }

    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
    }

    socket = io();
    window.drawModule?.setSocket?.(socket);
    setupSocketHandlers(username);

    if (socket.connected) {
      socket.emit('join', username);
    }
  } catch (err) {
    console.error(err);
    if (joinBtn) joinBtn.disabled = false;
    showToast('参加処理でエラーが発生しました');
  }
}

window.joinBoard = joinBoard;
joinBtn?.addEventListener('click', joinBoard);
usernameInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinBoard();
});

let currentUsername = '';
const itemElements = new Map();
const itemData = new Map();
const imageBlobCache = new Map();
let dragState = null;
let transformState = null;
let dropPoint = null;
let toastTimer = null;

function isHost() {
  const h = location.hostname;
  return h === 'localhost' || h === '127.0.0.1';
}

function createUrlChip(url) {
  const chip = document.createElement('div');
  chip.className = 'host-url-chip';

  const code = document.createElement('code');
  code.textContent = url;

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'copy-btn';
  copyBtn.textContent = '⎘';
  copyBtn.title = 'URLをコピー';
  copyBtn.addEventListener('click', async () => {
    await navigator.clipboard.writeText(url);
    copyBtn.textContent = '✓';
    copyBtn.classList.add('copied');
    setTimeout(() => {
      copyBtn.textContent = '⎘';
      copyBtn.classList.remove('copied');
    }, 1500);
  });

  chip.appendChild(code);
  chip.appendChild(copyBtn);
  return chip;
}

async function showHostConnectionInfo() {
  if (!isHost()) return;

  try {
    const res = await fetch('/api/info');
    const data = await res.json();
    const urls = data.urls.length ? data.urls : [data.localUrl];

    [hostUrls, hostUrlsLogin].forEach((container) => {
      if (!container) return;
      container.innerHTML = '';
      urls.forEach((url) => container.appendChild(createUrlChip(url)));
    });

    hostInfo?.classList.remove('hidden');
    hostInfoLogin?.classList.remove('hidden');
  } catch {
    // ignore
  }
}

showHostConnectionInfo();

async function showAppVersion() {
  const el = document.getElementById('app-version');
  if (!el || !window.electronHost?.getVersion) return;
  try {
    const version = await window.electronHost.getVersion();
    if (version) {
      el.textContent = `v${version}`;
      el.classList.remove('hidden');
      el.removeAttribute('aria-hidden');
    }
  } catch {
    // ignore
  }
}

showAppVersion();

saveBtn?.addEventListener('click', () => {
  if (!socket?.connected) return;
  updateSaveStatus('saving');
  socket.emit('board:save');
});

exportBtn?.addEventListener('click', async () => {
  try {
    const res = await fetch('/api/boards/export');
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `black-board-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('JSONファイルをダウンロードしました');
  } catch {
    showToast('書き出しに失敗しました');
  }
});

boardTabAdd?.addEventListener('click', () => {
  if (socket?.connected) socket.emit('board:create');
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showToast(text) {
  if (!toast) return;
  toast.textContent = text;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 2500);
}

function updateEmptyState() {
  const hasContent = itemElements.size > 0 || window.drawModule?.hasStrokes?.();
  boardEmpty.classList.toggle('hidden', hasContent);
}

function getBoardPoint(clientX, clientY) {
  const rect = board.getBoundingClientRect();
  return {
    x: clientX - rect.left + boardWrap.scrollLeft,
    y: clientY - rect.top + boardWrap.scrollTop,
  };
}

function getViewportCenterPoint() {
  return {
    x: boardWrap.scrollLeft + boardWrap.clientWidth / 2 - 80,
    y: boardWrap.scrollTop + boardWrap.clientHeight / 2 - 60,
  };
}

function extFromMime(mime) {
  const map = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
  };
  if (map[mime]) return map[mime];
  if (mime?.includes('word')) return 'docx';
  if (mime?.includes('sheet') || mime?.includes('excel')) return 'xlsx';
  if (mime?.includes('presentation') || mime?.includes('powerpoint')) return 'pptx';
  if (mime?.startsWith('text/')) return 'txt';
  if (mime?.startsWith('audio/')) return 'mp3';
  if (mime?.startsWith('video/')) return 'mp4';
  return 'bin';
}

const ATTACHABLE_EXT = /\.(jpe?g|png|gif|webp|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv|md|json|zip|rar|7z|mp3|mp4|wav|webm|ogg)$/i;

function fileExtLabel(name) {
  const ext = (String(name || '').split('.').pop() || 'file').toUpperCase();
  return ext.slice(0, 4);
}

function getItemAssetUrl(item) {
  return item.imageUrl || item.fileUrl || '';
}

const EXPORT_DRAG_TYPE = 'application/x-blackboard-export';
const DEFAULT_NOTE_COLOR = '#fef3c7';
let noteColorPickTarget = 'form';
let myNoteColor = DEFAULT_NOTE_COLOR;
let pendingNoteColor = DEFAULT_NOTE_COLOR;

function isExportDrag(dt) {
  return dt.types && [...dt.types].includes(EXPORT_DRAG_TYPE);
}

function cacheImageBlob(url) {
  if (imageBlobCache.has(url)) return;
  fetch(url)
    .then((r) => r.blob())
    .then((blob) => imageBlobCache.set(url, blob))
    .catch(() => {});
}

function isInteractiveHandle(target) {
  return target.closest('.delete-btn, .copy-btn, .export-handle, .resize-handle, .rotate-handle, .note-color-btn, .board-item-note-input, .board-item-note-content, .board-item-file-open');
}

function darkenHex(hex, amount = 0.12) {
  const h = hex.replace('#', '');
  const r = Math.max(0, Math.round(parseInt(h.slice(0, 2), 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(h.slice(2, 4), 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(h.slice(4, 6), 16) * (1 - amount)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function createPostItSvg(color) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'postit-icon');
  svg.setAttribute('aria-hidden', 'true');

  const body = document.createElementNS(SVG_NS, 'path');
  body.setAttribute('d', 'M6 2h10a2 2 0 0 1 2 2v12l-4-4H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z');
  body.setAttribute('fill', color);

  const fold = document.createElementNS(SVG_NS, 'path');
  fold.setAttribute('d', 'M16 16h4v4');
  fold.setAttribute('fill', darkenHex(color, 0.18));

  svg.appendChild(body);
  svg.appendChild(fold);
  return svg;
}

function createPostItCopySvg() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'postit-icon postit-icon-copy');
  svg.setAttribute('aria-hidden', 'true');

  const back = document.createElementNS(SVG_NS, 'path');
  back.setAttribute('d', 'M9 3h9a1.5 1.5 0 0 1 1.5 1.5V13H11A1.5 1.5 0 0 1 9.5 11.5V3z');
  back.setAttribute('fill', 'currentColor');
  back.setAttribute('opacity', '0.45');

  const front = document.createElementNS(SVG_NS, 'path');
  front.setAttribute('d', 'M5 6h9a1.5 1.5 0 0 1 1.5 1.5V16A1.5 1.5 0 0 1 14 17.5H5A1.5 1.5 0 0 1 3.5 16V7.5A1.5 1.5 0 0 1 5 6z');
  front.setAttribute('fill', 'currentColor');

  const fold = document.createElementNS(SVG_NS, 'path');
  fold.setAttribute('d', 'M14 15h3v3');
  fold.setAttribute('fill', 'currentColor');
  fold.setAttribute('opacity', '0.65');

  svg.append(back, front, fold);
  return svg;
}

function setPostItColorButton(btn, color) {
  btn.innerHTML = '';
  btn.style.background = 'transparent';
  btn.appendChild(createPostItSvg(color));
}

function noteTextColor(bgHex) {
  const hex = bgHex.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? '#1f2937' : '#f9fafb';
}

function applyNoteAppearance(el, item) {
  const bg = item.noteColor || DEFAULT_NOTE_COLOR;
  const fg = noteTextColor(bg);
  const note = el.querySelector('.board-item-note');
  const content = el.querySelector('.board-item-note-content');
  const author = el.querySelector('.board-item-note-author');
  const colorBtn = el.querySelector('.note-color-btn');
  if (note) {
    note.style.background = bg;
    note.style.setProperty('--note-fold', darkenHex(bg, 0.14));
  }
  if (content) content.style.color = fg;
  if (author) author.style.color = fg;
  if (colorBtn) setPostItColorButton(colorBtn, bg);
}

function applyItemStyles(el, item) {
  el.style.left = `${item.x}px`;
  el.style.top = `${item.y}px`;

  const body = el.querySelector('.board-item-body');
  if (body) {
    body.style.transform = `rotate(${item.rotation || 0}deg)`;
  }

  if (item.type === 'image') {
    const img = el.querySelector('.board-item-image-wrap img');
    if (img && item.width) {
      img.style.width = `${item.width}px`;
      img.style.maxWidth = 'none';
      img.style.maxHeight = 'none';
    }
  }

  if (item.type === 'text') {
    applyNoteAppearance(el, item);
  }
}

function deleteItem(item) {
  if (socket) socket.emit('board:delete', { id: item.id });
}

function createDeleteButton(item) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'delete-btn';
  btn.textContent = '×';
  btn.title = '削除';
  btn.setAttribute('aria-label', '削除');
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  btn.addEventListener('pointerup', (e) => {
    e.preventDefault();
    e.stopPropagation();
    deleteItem(item);
  });
  return btn;
}

async function copyNoteText(item) {
  const text = item.text || '';
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  showToast('付箋をコピーしました');
}

function createCopyButton(item) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'copy-btn';
  btn.appendChild(createPostItCopySvg());
  btn.title = 'テキストをコピー';
  btn.setAttribute('aria-label', 'テキストをコピー');
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  btn.addEventListener('pointerup', (e) => {
    e.preventDefault();
    e.stopPropagation();
    copyNoteText(item);
  });
  return btn;
}

function removeItemFromBoard(id) {
  const el = itemElements.get(id);
  if (el) el.remove();
  itemElements.delete(id);
  itemData.delete(id);
  updateEmptyState();
}

function updateItemOnBoard(data) {
  const item = itemData.get(data.id);
  if (!item) return;

  if (data.x != null) item.x = data.x;
  if (data.y != null) item.y = data.y;
  if (data.width != null) item.width = data.width;
  if (data.rotation != null) item.rotation = data.rotation;
  if (data.text != null) item.text = data.text;
  if (data.noteColor != null) item.noteColor = data.noteColor;

  const el = itemElements.get(data.id);
  if (el) {
    const content = el.querySelector('.board-item-note-content');
    if (content && data.text != null) content.textContent = data.text;
    applyItemStyles(el, item);
  }
}

function updateFormNoteColorBtn() {
  if (noteFormColorBtn) {
    setPostItColorButton(noteFormColorBtn, pendingNoteColor);
  }
  if (noteInput) {
    noteInput.style.borderLeftWidth = '3px';
    noteInput.style.borderLeftColor = pendingNoteColor;
  }
}

function openNoteColorPicker(target) {
  const picker = document.getElementById('note-color-picker');
  if (!picker) return;

  noteColorPickTarget = target;
  if (target === 'form') {
    picker.value = pendingNoteColor;
  } else {
    const item = itemData.get(target);
    picker.value = item?.noteColor || DEFAULT_NOTE_COLOR;
  }
  picker.click();
}

function createNoteColorButton(item) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'note-color-btn';
  btn.title = 'ダブルクリックで色変更';
  btn.setAttribute('aria-label', '付箋の色を変更');
  setPostItColorButton(btn, item.noteColor || DEFAULT_NOTE_COLOR);
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  btn.addEventListener('dblclick', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openNoteColorPicker(item.id);
  });
  return btn;
}

function createNoteContentElement(item) {
  const content = document.createElement('div');
  content.className = 'board-item-note-content';
  content.textContent = item.text;
  content.title = 'ダブルクリックで編集';
  content.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    startNoteEdit(item);
  });
  return content;
}

function buildTextNoteCard(item) {
  const note = document.createElement('div');
  note.className = 'board-item-note';

  const noteHeader = document.createElement('div');
  noteHeader.className = 'board-item-note-header';

  const author = document.createElement('span');
  author.className = 'board-item-note-author';
  author.textContent = item.username;

  const noteActions = document.createElement('div');
  noteActions.className = 'board-item-note-actions';
  noteActions.appendChild(createNoteColorButton(item));
  noteActions.appendChild(createCopyButton(item));
  noteActions.appendChild(createDeleteButton(item));

  noteHeader.appendChild(author);
  noteHeader.appendChild(noteActions);
  note.appendChild(noteHeader);
  note.appendChild(createNoteContentElement(item));
  return note;
}

function startNoteEdit(item) {
  const el = itemElements.get(item.id);
  if (!el || el.classList.contains('note-editing')) return;

  const note = el.querySelector('.board-item-note-content') || el.querySelector('.board-item-note');
  if (!note) return;

  el.classList.add('note-editing');

  const textarea = document.createElement('textarea');
  textarea.className = 'board-item-note-input';
  textarea.value = item.text;
  textarea.maxLength = 200;
  textarea.rows = 3;
  const bg = item.noteColor || DEFAULT_NOTE_COLOR;
  textarea.style.background = bg;
  textarea.style.color = noteTextColor(bg);
  note.replaceWith(textarea);
  textarea.focus();
  textarea.select();

  const finish = () => finishNoteEdit(item, textarea);

  textarea.addEventListener('blur', finish, { once: true });
  textarea.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      textarea.blur();
    }
    if (e.key === 'Escape') {
      textarea.value = item.text;
      textarea.blur();
    }
  });
}

function finishNoteEdit(item, textarea) {
  const el = itemElements.get(item.id);
  if (!el) return;

  const text = textarea.value.trim();
  el.classList.remove('note-editing');

  if (!text) {
    deleteItem(item);
    return;
  }

  item.text = text;

  const content = createNoteContentElement(item);
  textarea.replaceWith(content);
  applyItemStyles(el, item);

  if (socket) {
    socket.emit('board:update', { id: item.id, text });
  }
}

function setupNoteColorPicker() {
  const picker = document.getElementById('note-color-picker');
  if (!picker || picker.dataset.ready) return;
  picker.dataset.ready = '1';

  picker.addEventListener('input', () => {
    const color = picker.value.toLowerCase();

    if (noteColorPickTarget === 'form') {
      pendingNoteColor = color;
      updateFormNoteColorBtn();
      return;
    }

    const item = itemData.get(noteColorPickTarget);
    if (!item) return;

    item.noteColor = color;
    const el = itemElements.get(item.id);
    if (el) applyItemStyles(el, item);

    if (socket) {
      socket.emit('board:update', { id: item.id, noteColor: item.noteColor });
    }
  });

  noteFormColorBtn?.addEventListener('pointerdown', (e) => e.preventDefault());
  noteFormColorBtn?.addEventListener('dblclick', (e) => {
    e.preventDefault();
    openNoteColorPicker('form');
  });

  updateFormNoteColorBtn();
}

setupNoteColorPicker();
function setupExportHandle(handle, item) {
  handle.draggable = true;
  handle.title = 'PCのデスクトップやフォルダにドラッグして保存';

  const assetUrl = getItemAssetUrl(item);
  cacheFileBlob(assetUrl);

  handle.addEventListener('dragstart', (e) => {
    e.stopPropagation();
    e.dataTransfer.setData(EXPORT_DRAG_TYPE, item.id);
    e.dataTransfer.effectAllowed = 'copy';

    if (window.electronHost) {
      e.preventDefault();
      window.electronHost.startDrag(assetUrl);
      return;
    }

    const blob = imageBlobCache.get(assetUrl);
    if (!blob) {
      e.preventDefault();
      cacheFileBlob(assetUrl);
      showToast('ファイルを準備中です。少し待ってから再度ドラッグしてください');
      return;
    }

    const fallbackName = item.fileName || `blackboard-${item.id.slice(-8)}.${extFromMime(blob.type)}`;
    const file = new File([blob], fallbackName, { type: blob.type || item.mimeType || 'application/octet-stream' });
    e.dataTransfer.items.clear();
    e.dataTransfer.items.add(file);
  });

  handle.addEventListener('pointerdown', (e) => e.stopPropagation());
}

function buildAttachmentHeader(item, actions) {
  const header = document.createElement('div');
  header.className = 'board-item-header';

  const label = document.createElement('span');
  label.className = 'board-item-label';
  label.textContent = item.username;

  const actionWrap = document.createElement('div');
  actionWrap.className = 'board-item-actions';

  const rotateHandle = document.createElement('button');
  rotateHandle.type = 'button';
  rotateHandle.className = 'rotate-handle';
  rotateHandle.textContent = '↻';
  rotateHandle.title = '回転';
  rotateHandle.addEventListener('pointerdown', (e) => startRotate(e, item));

  actionWrap.appendChild(rotateHandle);
  if (typeof actions === 'function') actions(actionWrap);
  actionWrap.appendChild(createDeleteButton(item));

  header.appendChild(label);
  header.appendChild(actionWrap);
  return header;
}

function startResize(e, item) {
  const el = itemElements.get(item.id);
  const img = el?.querySelector('.board-item-image-wrap img');
  if (!el || !img) return;

  e.preventDefault();
  e.stopPropagation();
  el.setPointerCapture(e.pointerId);
  el.classList.add('transforming');

  transformState = {
    mode: 'resize',
    id: item.id,
    el,
    pointerId: e.pointerId,
    startClientX: e.clientX,
    startWidth: img.offsetWidth || item.width || 280,
  };
}

function startRotate(e, item) {
  const el = itemElements.get(item.id);
  const body = el?.querySelector('.board-item-body');
  if (!el || !body) return;

  e.preventDefault();
  e.stopPropagation();
  el.setPointerCapture(e.pointerId);
  el.classList.add('transforming');

  const rect = body.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  transformState = {
    mode: 'rotate',
    id: item.id,
    el,
    pointerId: e.pointerId,
    centerX: cx,
    centerY: cy,
    startRotation: item.rotation || 0,
    startPointerAngle: Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI),
  };
}

function createBoardItemElement(rawItem) {
  const item = {
    ...rawItem,
    width: rawItem.type === 'image' ? (rawItem.width || 280) : null,
    rotation: rawItem.rotation || 0,
    noteColor: rawItem.type === 'text' ? (rawItem.noteColor || DEFAULT_NOTE_COLOR) : null,
  };

  const el = document.createElement('div');
  el.className = `board-item board-item-${item.type}`;
  el.dataset.id = item.id;

  const body = document.createElement('div');
  body.className = 'board-item-body';

  if (item.type === 'image') {
    const header = buildAttachmentHeader(item, (actions) => {
      /* delete appended in buildAttachmentHeader */
    });

    const wrap = document.createElement('div');
    wrap.className = 'board-item-image-wrap';

    const img = document.createElement('img');
    img.src = item.imageUrl;
    img.alt = 'ボード画像';
    img.draggable = false;
    img.addEventListener('load', () => cacheFileBlob(item.imageUrl));
    if (img.complete) cacheFileBlob(item.imageUrl);
    img.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      openLightbox(item.imageUrl);
    });

    const exportHandle = document.createElement('button');
    exportHandle.type = 'button';
    exportHandle.className = 'export-handle';
    exportHandle.textContent = '↗';
    exportHandle.setAttribute('aria-label', 'PCにドラッグして保存');
    setupExportHandle(exportHandle, item);

    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'resize-handle';
    resizeHandle.title = 'サイズ変更';
    resizeHandle.addEventListener('pointerdown', (e) => startResize(e, item));

    wrap.appendChild(img);
    wrap.appendChild(exportHandle);
    wrap.appendChild(resizeHandle);
    body.appendChild(wrap);
    el.appendChild(header);
    el.appendChild(body);
  } else if (item.type === 'file') {
    const header = buildAttachmentHeader(item, () => {});

    const card = document.createElement('div');
    card.className = 'board-item-file';

    const badge = document.createElement('div');
    badge.className = 'board-item-file-badge';
    badge.textContent = fileExtLabel(item.fileName);

    const name = document.createElement('div');
    name.className = 'board-item-file-name';
    name.textContent = item.fileName;
    name.title = item.fileName;

    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'board-item-file-open';
    openBtn.textContent = '開く';
    openBtn.title = 'ファイルを開く';
    openBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.open(item.fileUrl, '_blank', 'noopener');
    });

    const exportHandle = document.createElement('button');
    exportHandle.type = 'button';
    exportHandle.className = 'export-handle board-item-file-export';
    exportHandle.textContent = '↗';
    exportHandle.setAttribute('aria-label', 'PCにドラッグして保存');
    setupExportHandle(exportHandle, item);

    card.appendChild(badge);
    card.appendChild(name);
    card.appendChild(openBtn);
    card.appendChild(exportHandle);
    cacheFileBlob(item.fileUrl);
    body.appendChild(card);
    el.appendChild(header);
    el.appendChild(body);
  } else {
    body.appendChild(buildTextNoteCard(item));
    el.appendChild(body);
  }

  el.addEventListener('pointerdown', (e) => {
    if (isInteractiveHandle(e.target)) return;
    if (el.classList.contains('note-editing')) return;
    startDrag(e, item.id);
  });

  board.appendChild(el);
  itemElements.set(item.id, el);
  itemData.set(item.id, { ...item });
  applyItemStyles(el, item);
  updateEmptyState();
  return el;
}

function openLightbox(src) {
  const overlay = document.createElement('div');
  overlay.className = 'lightbox';
  overlay.innerHTML = `<img src="${src}" alt="拡大画像">`;
  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}

function startDrag(e, id) {
  if (e.button !== 0) return;
  const el = itemElements.get(id);
  if (!el) return;

  e.preventDefault();
  el.setPointerCapture(e.pointerId);
  el.classList.add('dragging');

  dragState = {
    id,
    el,
    pointerId: e.pointerId,
    startClientX: e.clientX,
    startClientY: e.clientY,
    startX: parseFloat(el.style.left) || 0,
    startY: parseFloat(el.style.top) || 0,
  };
}

function onPointerMove(e) {
  if (transformState && e.pointerId === transformState.pointerId) {
    const item = itemData.get(transformState.id);
    if (!item) return;

    if (transformState.mode === 'resize') {
      const dx = e.clientX - transformState.startClientX;
      const width = Math.min(900, Math.max(80, transformState.startWidth + dx));
      item.width = width;
      applyItemStyles(transformState.el, item);
    } else if (transformState.mode === 'rotate') {
      const angle = Math.atan2(
        e.clientY - transformState.centerY,
        e.clientX - transformState.centerX
      ) * (180 / Math.PI);
      const delta = angle - transformState.startPointerAngle;
      item.rotation = Math.round(transformState.startRotation + delta);
      applyItemStyles(transformState.el, item);
    }
    return;
  }

  if (!dragState || e.pointerId !== dragState.pointerId) return;

  const dx = e.clientX - dragState.startClientX;
  const dy = e.clientY - dragState.startClientY;

  dragState.el.style.left = `${Math.max(0, dragState.startX + dx)}px`;
  dragState.el.style.top = `${Math.max(0, dragState.startY + dy)}px`;
}

function onPointerUp(e) {
  if (transformState && e.pointerId === transformState.pointerId) {
    const { id, el } = transformState;
    el.classList.remove('transforming');
    el.releasePointerCapture(e.pointerId);

    const item = itemData.get(id);
    if (socket && item) {
      socket.emit('board:update', {
        id,
        x: item.x,
        y: item.y,
        width: item.width,
        rotation: item.rotation,
      });
    }

    transformState = null;
    return;
  }

  if (!dragState || e.pointerId !== dragState.pointerId) return;

  const { id, el } = dragState;
  el.classList.remove('dragging');
  el.releasePointerCapture(e.pointerId);

  const x = parseFloat(el.style.left) || 0;
  const y = parseFloat(el.style.top) || 0;
  const item = itemData.get(id);
  if (item) {
    item.x = x;
    item.y = y;
  }

  if (socket) {
    socket.emit('board:move', { id, x, y });
  }

  dragState = null;
}

board?.addEventListener('pointermove', onPointerMove);
board?.addEventListener('pointerup', onPointerUp);
board?.addEventListener('pointercancel', onPointerUp);

function addItemToBoard(item) {
  if (item.type === 'stroke') return;
  if (itemElements.has(item.id)) return;
  createBoardItemElement(item);
}

function moveItemOnBoard(data) {
  updateItemOnBoard(data);
}

async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch('/upload', { method: 'POST', body: formData });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'アップロードに失敗しました');
  }
  return data;
}

function isImageFile(file) {
  if (!file) return false;
  if (file.type && file.type.startsWith('image/')) return true;
  return /\.(jpe?g|png|gif|webp)$/i.test(file.name || '');
}

function isAttachableFile(file) {
  if (!file) return false;
  if (isImageFile(file)) return true;
  return ATTACHABLE_EXT.test(file.name || '');
}

function hasIncomingFiles(dt) {
  if (!dt || isExportDrag(dt)) return false;
  return [...dt.types].includes('Files');
}

function getFilesFromDataTransfer(dt) {
  const files = [...dt.files].filter(isAttachableFile);
  if (files.length) return files;

  if (!dt.items) return [];

  const fromItems = [];
  for (const item of dt.items) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (file && isAttachableFile(file)) fromItems.push(file);
  }
  return fromItems;
}

async function placeAttachment(file, point) {
  if (!socket) return;

  try {
    const uploaded = await uploadFile(file);
    const base = {
      x: Math.max(0, point.x - 100),
      y: Math.max(0, point.y - 80),
      rotation: 0,
    };

    if (isImageFile(file)) {
      socket.emit('board:add', {
        ...base,
        type: 'image',
        imageUrl: uploaded.url,
        width: 280,
      });
    } else {
      socket.emit('board:add', {
        ...base,
        type: 'file',
        fileUrl: uploaded.url,
        fileName: uploaded.fileName || file.name,
        mimeType: uploaded.mimeType || file.type || 'application/octet-stream',
      });
    }
  } catch (err) {
    showToast(err.message);
  }
}

async function handleFiles(files, point) {
  const attachable = files.filter(isAttachableFile);
  if (!attachable.length) {
    showToast('対応ファイル（画像 / PDF / Office / テキスト / ZIP など）をドロップしてください');
    return;
  }

  let offset = 0;
  for (const file of attachable) {
    await placeAttachment(file, {
      x: point.x + offset,
      y: point.y + offset,
    });
    offset += 24;
  }
}

let dropZoneReady = false;

function setupDropZone() {
  if (dropZoneReady || !boardWrap) return;
  dropZoneReady = true;

  boardWrap.addEventListener('dragover', (e) => {
    if (isExportDrag(e.dataTransfer)) {
      e.dataTransfer.dropEffect = 'none';
      return;
    }
    if (!hasIncomingFiles(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    dropPoint = getBoardPoint(e.clientX, e.clientY);
  }, true);

  boardWrap.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (isExportDrag(e.dataTransfer)) return;

    const point = dropPoint || getBoardPoint(e.clientX, e.clientY);
    dropPoint = null;

    const files = getFilesFromDataTransfer(e.dataTransfer);
    if (!files.length) {
      showToast('対応ファイル（画像 / PDF / Office / テキスト / ZIP など）をドロップしてください');
      return;
    }

    await handleFiles(files, point);
  }, true);
}

document.addEventListener('paste', async (e) => {
  if (!socket || boardScreen.classList.contains('hidden')) return;

  const files = [...(e.clipboardData?.files || [])].filter(isAttachableFile);
  if (!files.length) return;

  e.preventDefault();
  await handleFiles(files, getViewportCenterPoint());
});

addImageBtn?.addEventListener('click', () => fileInput?.click());

fileInput?.addEventListener('change', async (e) => {
  const files = [...e.target.files].filter(isAttachableFile);
  fileInput.value = '';
  if (!files.length) return;
  await handleFiles(files, getViewportCenterPoint());
});

noteForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = noteInput.value.trim();
  if (!text || !socket) return;

  const point = getViewportCenterPoint();
  socket.emit('board:add', {
    type: 'text',
    x: point.x,
    y: point.y,
    text,
    noteColor: pendingNoteColor,
  });
  noteInput.value = '';
  pendingNoteColor = myNoteColor;
  updateFormNoteColorBtn();
});
