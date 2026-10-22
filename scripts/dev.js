// Runs the API server (restarting on changes) and the Vite dev server together.
import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const procs = [
  spawn(npm, ['run', 'dev', '-w', 'server'], { stdio: 'inherit' }),
  spawn(npm, ['run', 'dev', '-w', 'web'], { stdio: 'inherit' }),
];

const stop = () => {
  for (const p of procs) p.kill();
  process.exit();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', stop);
