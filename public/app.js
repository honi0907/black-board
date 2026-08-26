const loginScreen = document.getElementById('login-screen');
const chatScreen = document.getElementById('chat-screen');
const usernameInput = document.getElementById('username-input');
const joinBtn = document.getElementById('join-btn');
const messagesEl = document.getElementById('messages');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const imageInput = document.getElementById('image-input');
const imagePreview = document.getElementById('image-preview');
const previewImg = document.getElementById('preview-img');
const removePreview = document.getElementById('remove-preview');
const sendBtn = document.getElementById('send-btn');
const onlineCount = document.getElementById('online-count');

let socket = null;
let currentUsername = '';
let pendingImageFile = null;

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function scrollToBottom() {
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function createMessageElement(msg, isSystem = false) {
  const isMine = !isSystem && msg.username === currentUsername;
  const div = document.createElement('div');
  div.className = `message ${isSystem ? 'system' : isMine ? 'mine' : 'other'}`;

  if (isSystem) {
    div.innerHTML = `<div class="message-bubble">${escapeHtml(msg.text)}</div>`;
    return div;
  }

  let content = '';
  if (msg.text) {
    content += `<div class="message-text">${escapeHtml(msg.text)}</div>`;
  }
  if (msg.imageUrl) {
    content += `<img class="message-image" src="${escapeHtml(msg.imageUrl)}" alt="添付画像" loading="lazy">`;
  }

  div.innerHTML = `
    <div class="message-meta">${escapeHtml(msg.username)} · ${formatTime(msg.time)}</div>
    <div class="message-bubble">${content}</div>
  `;

  const img = div.querySelector('.message-image');
  if (img) {
    img.addEventListener('click', () => openLightbox(msg.imageUrl));
  }

  return div;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function openLightbox(src) {
  const overlay = document.createElement('div');
  overlay.className = 'lightbox';
  overlay.innerHTML = `<img src="${src}" alt="拡大画像">`;
  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}

function joinChat() {
  const username = usernameInput.value.trim() || 'ゲスト';
  currentUsername = username;

  socket = io();

  socket.on('connect', () => {
    socket.emit('join', username);
  });

  socket.on('history', (history) => {
    messagesEl.innerHTML = '';
    history.forEach((msg) => messagesEl.appendChild(createMessageElement(msg)));
    scrollToBottom();
  });

  socket.on('message', (msg) => {
    messagesEl.appendChild(createMessageElement(msg));
    scrollToBottom();
  });

  socket.on('system', (msg) => {
    messagesEl.appendChild(createMessageElement(msg, true));
    scrollToBottom();
  });

  socket.on('users', (users) => {
    onlineCount.textContent = `${users.length} 人がオンライン`;
  });

  loginScreen.classList.add('hidden');
  chatScreen.classList.remove('hidden');
  messageInput.focus();
}

async function uploadImage(file) {
  const formData = new FormData();
  formData.append('image', file);

  const res = await fetch('/upload', { method: 'POST', body: formData });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'アップロードに失敗しました');
  }
  return data.url;
}

function clearImagePreview() {
  pendingImageFile = null;
  imagePreview.classList.add('hidden');
  previewImg.src = '';
  imageInput.value = '';
}

joinBtn.addEventListener('click', joinChat);
usernameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinChat();
});

imageInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  pendingImageFile = file;
  previewImg.src = URL.createObjectURL(file);
  imagePreview.classList.remove('hidden');
});

removePreview.addEventListener('click', clearImagePreview);

messageForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const text = messageInput.value.trim();
  if (!text && !pendingImageFile) return;

  sendBtn.disabled = true;

  try {
    let imageUrl = null;
    if (pendingImageFile) {
      imageUrl = await uploadImage(pendingImageFile);
      clearImagePreview();
    }

    socket.emit('message', { text, imageUrl });
    messageInput.value = '';
  } catch (err) {
    alert(err.message);
  } finally {
    sendBtn.disabled = false;
    messageInput.focus();
  }
});
