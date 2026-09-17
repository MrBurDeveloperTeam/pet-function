// Local-only build and asset delivery. No registry/API requests are made here.
import { existsSync, readdirSync, readFileSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspace = resolve(root, '..');
const hosts = ['E-learning']; // Pilot only. Other apps are deliberately not connected.
const host = resolve(process.argv[2] || process.cwd());
if (!hosts.some(name => resolve(workspace, name) === host)) throw new Error('Unknown host: ' + host);

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}
const hash = createHash('sha256');
for (const path of [...files(join(root, 'src')), ...files(join(root, 'scripts')), join(root, 'tsup.config.ts'), join(root, 'package.json')].sort()) {
  hash.update(relative(root, path)).update(readFileSync(path));
}
const fingerprint = hash.digest('hex');
const stamp = join(root, 'dist', '.source-fingerprint');
if (!existsSync(stamp) || readFileSync(stamp, 'utf8') !== fingerprint) {
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
    cwd: root, stdio: 'inherit', shell: process.platform === 'win32',
  });
  if (result.status !== 0) throw new Error('Shared pet build failed; host build stopped.');
  writeFileSync(stamp, fingerprint);
}

// Before replacing a resource, keep the original once for rollback.
// public copies are generated deployment files, never the maintenance source.
for (const source of files(join(root, 'public'))) {
  const name = relative(join(root, 'public'), source);
  if (name.split(/[\\/]/)[0] === 'games') continue;
  const target = join(host, 'public', name);
  const backup = join(root, 'migration-backups', relative(workspace, host), 'public', name);
  if (existsSync(target) && !existsSync(backup)) {
    mkdirSync(dirname(backup), { recursive: true });
    copyFileSync(target, backup);
  }
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}
console.log('[pet_function] shared code and resources ready for ' + relative(workspace, host));
