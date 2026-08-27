const { execSync } = require('child_process');

const port = process.argv[2] || '3000';

try {
  const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
  const pids = new Set();

  for (const line of out.split('\n')) {
    if (!line.includes('LISTENING')) continue;
    const parts = line.trim().split(/\s+/);
    const pid = parts[parts.length - 1];
    if (pid && /^\d+$/.test(pid)) pids.add(pid);
  }

  for (const pid of pids) {
    try {
      const task = execSync(`tasklist /FI "PID eq ${pid}"`, { encoding: 'utf8' });
      if (task.includes('node.exe')) {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
        console.log(`ポート ${port} を使用中だった Node (PID ${pid}) を終了しました`);
      }
    } catch {
      // ignore
    }
  }
} catch {
  // port is free
}
