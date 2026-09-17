const { spawn } = require('node:child_process');

const url = 'http://localhost:3001';

if (process.platform === 'win32') {
  spawn('cmd.exe', ['/c', 'start', '', url], {
    detached: true,
    stdio: 'ignore',
  }).unref();
} else {
  const command = process.platform === 'darwin' ? 'open' : 'xdg-open';

  spawn(command, [url], {
    detached: true,
    stdio: 'ignore',
  }).unref();
}

console.log(`Opened ${url}`);
