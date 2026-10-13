#!/usr/bin/env node
// npm run dev  -> starts the backend (port 5000) and the frontend (port 5173) together.
// Run it from the project folder (the one that contains "backend" and "frontend").
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn, spawnSync } = require('child_process');

const ROOT = process.env.TECHSHIELD_ROOT || path.resolve(__dirname, '..');
const isWin = process.platform === 'win32';
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;

const services = [
  { name: 'backend', dir: path.join(ROOT, 'backend'), port: 5000, color: '\x1b[36m', needs: ['.env', 'node_modules'] },
  { name: 'frontend', dir: path.join(ROOT, 'frontend'), port: 5173, color: '\x1b[35m', needs: ['node_modules'] },
].filter((s) => !only || s.name === only);

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.setTimeout(800);
    socket.on('connect', () => { socket.destroy(); resolve(true); });
    socket.on('timeout', () => { socket.destroy(); resolve(false); });
    socket.on('error', () => resolve(false));
  });
}

async function main() {
  const problems = [];
  for (const s of services) {
    for (const need of s.needs) {
      if (!fs.existsSync(path.join(s.dir, need))) {
        problems.push(need === '.env' ? `${s.name}/.env is missing -> run: npm run setup` : `${s.name}/node_modules is missing -> run: npm run install:all`);
      }
    }
    if (await portInUse(s.port)) {
      problems.push(`port ${s.port} (${s.name}) is already in use - an old copy is still running. Close its terminal, or free it with:\n    ${isWin ? `Get-NetTCPConnection -LocalPort ${s.port} -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }` : `kill $(lsof -t -i:${s.port})`}`);
    }
  }
  if (problems.length) {
    console.error('\nCannot start yet:\n');
    problems.forEach((p) => console.error(`  - ${p}`));
    console.error('');
    process.exit(1);
  }

  const command = process.env.TECHSHIELD_DEV_CMD || 'npm run dev';
  const children = services.map((s) => {
    const child = spawn(command, { cwd: s.dir, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const tag = `${s.color}[${s.name}]\x1b[0m `;
    const pipe = (stream, out) => {
      let buffer = '';
      stream.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop();
        lines.forEach((line) => out.write(`${tag}${line}\n`));
      });
    };
    pipe(child.stdout, process.stdout);
    pipe(child.stderr, process.stderr);
    child.on('exit', (code) => console.log(`${tag}stopped (exit ${code})`));
    return child;
  });

  console.log(`\nStarting ${services.map((s) => s.name).join(' + ')}...  open http://localhost:5173  (Ctrl + C stops everything)\n`);

  let stopping = false;
  function stopAll() {
    if (stopping) return;
    stopping = true;
    for (const child of children) {
      if (!child.pid) continue;
      try {
        if (isWin) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
        else child.kill('SIGTERM');
      } catch { /* already gone */ }
    }
    setTimeout(() => process.exit(0), 300);
  }
  process.on('SIGINT', stopAll);
  process.on('SIGTERM', stopAll);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
