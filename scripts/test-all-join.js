const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const root = path.join(__dirname, '..');

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function waitForServer(port) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tryOnce = () => {
      http.get(`http://127.0.0.1:${port}/`, (res) => {
        res.resume();
        if (res.statusCode === 200) resolve();
        else retry();
      }).on('error', retry);
    };
    const retry = () => {
      if (Date.now() - start > 10000) reject(new Error('timeout'));
      else setTimeout(tryOnce, 200);
    };
    tryOnce();
  });
}

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

async function socketJoin(port) {
  const handshake = await get(`http://127.0.0.1:${port}/socket.io/?EIO=4&transport=polling`);
  const json = JSON.parse(handshake.body.slice(handshake.body.indexOf('{')));
  const sid = json.sid;

  await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: `/socket.io/?EIO=4&transport=polling&sid=${sid}`,
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', 'Content-Length': 2 },
    }, (res) => {
      res.on('data', () => {});
      res.on('end', resolve);
    });
    req.on('error', reject);
    req.write('40');
    req.end();
  });

  const poll1 = await get(`http://127.0.0.1:${port}/socket.io/?EIO=4&transport=polling&sid=${sid}`);
  const joinPayload = JSON.stringify(['join', 'test-user']);
  const packet = `42${joinPayload}`;

  await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: `/socket.io/?EIO=4&transport=polling&sid=${sid}`,
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', 'Content-Length': Buffer.byteLength(packet) },
    }, (res) => {
      res.on('data', () => {});
      res.on('end', resolve);
    });
    req.on('error', reject);
    req.write(packet);
    req.end();
  });

  await wait(200);
  const poll2 = await get(`http://127.0.0.1:${port}/socket.io/?EIO=4&transport=polling&sid=${sid}`);
  if (!poll2.body.includes('board:history')) {
    throw new Error(`join response missing board:history: ${poll2.body.slice(0, 200)}`);
  }
  console.log('OK: socket join + board:history');
}

async function main() {
  try {
    require('child_process').execSync('node scripts/free-port.js 3000', { cwd: root, stdio: 'pipe' });
  } catch {
    // ignore
  }

  const server = spawn('node', ['server.js'], { cwd: root, stdio: 'pipe', env: { ...process.env, PORT: '3000' } });
  server.stderr.on('data', (d) => process.stderr.write(d));
  server.stdout.on('data', (d) => process.stdout.write(d));

  try {
    await waitForServer(3000);
    const page = await get('http://127.0.0.1:3000/');
    if (!page.body.includes('window.joinBoard')) throw new Error('HTML missing joinBoard onclick');

    const app = await get('http://127.0.0.1:3000/app.js?v=3');
    if (!app.body.includes('function joinBoard')) throw new Error('app.js missing joinBoard');

    const { runSimulateJoin } = require('./simulate-join');
    await runSimulateJoin();
    await socketJoin(3000);

    console.log('ALL TESTS PASSED');
    server.kill();
    process.exit(0);
  } catch (err) {
    console.error('TEST FAILED:', err.message);
    server.kill();
    process.exit(1);
  }
}

main();
