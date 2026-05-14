import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.join(__dirname, '..');
const port = process.env.PORT ?? '4300';

const require = createRequire(path.join(appRoot, 'package.json'));
let nextCli;
try {
  const nextPkg = require.resolve('next/package.json');
  nextCli = path.join(path.dirname(nextPkg), 'dist', 'bin', 'next');
} catch {
  console.error('Could not resolve "next". Run pnpm install from the repo root.');
  process.exit(1);
}

const child = spawn(
  process.execPath,
  [nextCli, 'start', '-H', '0.0.0.0', '-p', String(port)],
  { cwd: appRoot, stdio: 'inherit' }
);

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
