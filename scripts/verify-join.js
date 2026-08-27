const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.join(__dirname, '..');

function waitForServer(port) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      http.get(`http://127.0.0.1:${port}/`, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else retry();
      }).on('error', retry);
    };
    const retry = () => {
      if (Date.now() - start > 10000) reject(new Error('server timeout'));
      else setTimeout(tick, 200);
    };
    tick();
  });
}

function verifyScriptsLoadTogether() {
  const w = {};
  const d = {
    getElementById: () => ({
      classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
      style: {},
      addEventListener() {},
      querySelectorAll: () => [],
      appendChild: () => ({}),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
      offsetWidth: 100,
      offsetHeight: 100,
    }),
    querySelectorAll: () => [],
    addEventListener() {},
    createElement: () => ({ classList: { add() {}, remove() {}, contains: () => false, toggle() {} } }),
  };
  const ctx = {
    window: w,
    document: d,
    location: { hostname: 'localhost' },
    console,
    setTimeout,
    clearTimeout,
    Map,
    fetch: async () => ({ json: async () => ({ urls: [], localUrl: 'http://localhost:3000' }) }),
    io: () => ({ on() { return this; }, emit() { return this; }, removeAllListeners() { return this; }, disconnect() {}, connected: false }),
    ResizeObserver: class { observe() {} },
  };
  ctx.globalThis = ctx;
  w.window = w;
  vm.runInNewContext(fs.readFileSync(path.join(root, 'public/draw.js'), 'utf8'), ctx);
  vm.runInNewContext(fs.readFileSync(path.join(root, 'public/app.js'), 'utf8'), ctx);
  if (typeof w.joinBoard !== 'function') throw new Error('joinBoard missing after script load');
  console.log('OK: draw.js + app.js load together');
}

async function socketJoin(port) {
  const handshake = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/socket.io/?EIO=4&transport=polling`, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
  const sid = JSON.parse(handshake.slice(handshake.indexOf('{'))).sid;

  await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port,
      path: `/socket.io/?EIO=4&transport=polling&sid=${sid}`,
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', 'Content-Length': 2 },
    }, (res) => { res.on('data', () => {}); res.on('end', resolve); });
    req.on('error', reject);
    req.write('40');
    req.end();
  });

  const packet = `42${JSON.stringify(['join', 'test-user'])}`;
  await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port,
      path: `/socket.io/?EIO=4&transport=polling&sid=${sid}`,
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', 'Content-Length': Buffer.byteLength(packet) },
    }, (res) => { res.on('data', () => {}); res.on('end', resolve); });
    req.on('error', reject);
    req.write(packet);
    req.end();
  });

  await new Promise((r) => setTimeout(r, 200));
  const poll = await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/socket.io/?EIO=4&transport=polling&sid=${sid}`, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });

  if (!poll.includes('board:history')) throw new Error('board:history not received');
  console.log('OK: socket join works');
}

async function main() {
  verifyScriptsLoadTogether();

  try {
    require('child_process').execSync('node scripts/free-port.js 3000', { cwd: root, stdio: 'pipe' });
  } catch {
    // ignore
  }

  const server = spawn('node', ['server.js'], { cwd: root, stdio: 'pipe' });
  server.stdout.on('data', (d) => process.stdout.write(d));

  try {
    await waitForServer(3000);
    await socketJoin(3000);
    console.log('ALL TESTS PASSED');
    server.kill();
    process.exit(0);
  } catch (err) {
    console.error('FAILED:', err.message);
    server.kill();
    process.exit(1);
  }
}

main();
