const serverUrlInput = document.getElementById('server-url');
const connectBtn = document.getElementById('connect-btn');
const errorMsg = document.getElementById('error-msg');

function showError(text) {
  errorMsg.textContent = text;
  errorMsg.classList.remove('hidden');
}

function hideError() {
  errorMsg.classList.add('hidden');
}

function normalizeUrl(raw) {
  let url = raw.trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) {
    url = `http://${url}`;
  }
  return url.replace(/\/+$/, '');
}

async function init() {
  if (window.electronAPI) {
    const lastUrl = await window.electronAPI.getLastUrl();
    if (lastUrl) serverUrlInput.value = lastUrl;
  }
  serverUrlInput.focus();
}

function connect() {
  hideError();
  const url = normalizeUrl(serverUrlInput.value);
  if (!url) {
    showError('ホストの URL を入力してください');
    return;
  }

  connectBtn.disabled = true;
  connectBtn.textContent = '接続中...';

  if (window.electronAPI) {
    window.electronAPI.connect(url);
  } else {
    window.location.href = url;
  }
}

connectBtn.addEventListener('click', connect);
serverUrlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') connect();
});

init();
