const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const root = path.join(__dirname, '..');

function waitForServer(port, timeoutMs = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      http.get(`http://127.0.0.1:${port}/`, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve(port);
        else retry();
      }).on('error', retry);
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) reject(new Error('server timeout'));
      else setTimeout(tick, 300);
    };
    tick();
  });
}

async function main() {
  require('./free-port').freePort?.(3000);
  try {
    require('child_process').execSync('node scripts/free-port.js 3000', { cwd: root, stdio: 'inherit' });
  } catch {
    // ignore
  }

  const server = spawn('node', ['server.js'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: '3000' },
  });

  let serverLog = '';
  server.stdout.on('data', (d) => { serverLog += d; process.stdout.write(d); });
  server.stderr.on('data', (d) => { serverLog += d; process.stderr.write(d); });

  try {
    await waitForServer(3000);

    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();

    const errors = [];
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
    });

    await page.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle0' });

    const hasJoin = await page.evaluate(() => typeof window.joinBoard === 'function' && typeof io === 'function');
    if (!hasJoin) {
      throw new Error('joinBoard or io missing on page');
    }

    await page.click('#join-btn');
    await page.waitForFunction(() => {
      const board = document.getElementById('board-screen');
      return board && !board.classList.contains('hidden');
    }, { timeout: 5000 });

    await page.waitForFunction(() => {
      const el = document.getElementById('online-count');
      return el && /[1-9]/.test(el.textContent);
    }, { timeout: 5000 });

    const state = await page.evaluate(() => ({
      loginHidden: document.getElementById('login-screen')?.classList.contains('hidden'),
      boardVisible: !document.getElementById('board-screen')?.classList.contains('hidden'),
      online: document.getElementById('online-count')?.textContent,
      errors: window.__joinErrors || [],
    }));

    console.log('E2E OK:', JSON.stringify(state));
    if (errors.length) {
      console.log('Browser errors:', errors);
    }

    await browser.close();
    server.kill();
    process.exit(0);
  } catch (err) {
    console.error('E2E FAILED:', err.message);
    console.error('Server log tail:', serverLog.slice(-500));
    server.kill();
    process.exit(1);
  }
}

main();
