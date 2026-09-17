const fs = require('node:fs');
const path = require('node:path');

const targetDirectory = path.resolve(
  __dirname,
  '../dist/assets/twenty-client-sdk',
);
const clientSdkDirectory = path.resolve(__dirname, '../../twenty-client-sdk');

fs.rmSync(targetDirectory, { recursive: true, force: true });
fs.mkdirSync(targetDirectory, { recursive: true });
fs.copyFileSync(
  path.join(clientSdkDirectory, 'package.json'),
  path.join(targetDirectory, 'package.json'),
);
fs.cpSync(
  path.join(clientSdkDirectory, 'dist'),
  path.join(targetDirectory, 'dist'),
  { recursive: true },
);
