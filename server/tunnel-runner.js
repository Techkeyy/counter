// server/tunnel-runner.js
// Persistent tunnel supervisor that restarts the tunnel automatically upon disconnection

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

let isShuttingDown = false;

function startTunnel() {
  if (isShuttingDown) return;

  console.log('[Tunnel Supervisor] Launching SSH tunnel to Serveo...');
  const ssh = spawn('ssh', [
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'ServerAliveInterval=15',
    '-o', 'ServerAliveCountMax=3',
    '-R', '80:127.0.0.1:3001',
    'serveo.net'
  ], {
    shell: true,
  });

  ssh.stdout.on('data', (data) => {
    const text = data.toString();
    console.log('[Tunnel Output]:', text.trim());
    const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.serveousercontent\.com/);
    if (match) {
      const url = match[0];
      console.log(`[Tunnel Supervisor] Active Live Public URL: ${url}`);
      fs.writeFileSync(path.join(__dirname, 'tunnel-url.txt'), url, 'utf-8');
    }
  });

  ssh.stderr.on('data', (data) => {
    console.log('[Tunnel Log]:', data.toString().trim());
  });

  ssh.on('close', (code) => {
    console.log(`[Tunnel Supervisor] Tunnel process exited with code ${code}. Reconnecting in 3 seconds...`);
    if (!isShuttingDown) {
      setTimeout(startTunnel, 3000);
    }
  });
}

process.on('SIGINT', () => {
  isShuttingDown = true;
  process.exit(0);
});

process.on('SIGTERM', () => {
  isShuttingDown = true;
  process.exit(0);
});

startTunnel();
