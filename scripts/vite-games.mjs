import { existsSync, statSync, createReadStream, readdirSync, mkdirSync, copyFileSync, rmSync, realpathSync } from 'node:fs';
import { resolve, join, relative, extname, dirname, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensurePublicResources } from './sync-resource-packs.mjs';

const packageRoot = fileURLToPath(new URL('../', import.meta.url));
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm', '.pck': 'application/octet-stream',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.avif': 'image/avif',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

function files(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : entry.isFile() ? [path] : [];
  });
}

function outside(base, target) {
  const name = relative(base, target);
  return name === '..' || name.startsWith('..' + sep) || isAbsolute(name);
}

function copy(source, target) {
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}

// The historical export name stays compatible with existing host Vite configs.
// Sources remain in this repository; installed core packages restore the matching
// release resources before Vite resolves assets or serves/builds a host.
export function sharedGamesPlugin(options = {}) {
  const root = resolve(options.packageRoot || packageRoot);
  let config;
  let pendingResources;
  const resources = () => pendingResources ||= ensurePublicResources(root, options.resourceOptions);

  return {
    name: 'pet-function-games',
    config() { return { build: { copyPublicDir: false } }; },
    async configResolved(value) {
      config = value;
      await resources();
    },
    async buildStart() { await resources(); },
    configureServer(server) {
      // Register before Vite's own public middleware so stale host copies never
      // win. Registration remains synchronous for existing middleware callers.
      server.middlewares.use(async (req, res, next) => {
        let url;
        try { url = decodeURIComponent((req.url || '').split('?')[0]); }
        catch { res.statusCode = 400; res.end('Invalid resource URL'); return; }
        const namespace = ['/games/', '/pet-function/'].find(prefix => url.startsWith(prefix));
        if (!namespace) return next();
        const name = url.slice(namespace.length);
        // Reject Windows separators/drives even on Unix build/dev hosts.
        if (/[\\\0:]/.test(name) || name.startsWith('/') || name.split('/').some(part => part === '..' || part === '.')) {
          res.statusCode = 403; res.end('Forbidden resource path'); return;
        }
        try {
          const publicRoot = await resources();
          const base = join(publicRoot, namespace.slice(1, -1));
          const path = resolve(base, name);
          if (outside(base, path)) { res.statusCode = 403; res.end('Forbidden resource path'); return; }
          const target = existsSync(path) && statSync(path).isDirectory() ? join(path, 'index.html') : path;
          if (!existsSync(target) || !statSync(target).isFile()) {
            res.statusCode = 404; res.end('Shared resource not found'); return;
          }
          if (outside(realpathSync(base), realpathSync(target))) {
            res.statusCode = 403; res.end('Forbidden resource path'); return;
          }
          res.setHeader('Content-Type', mime[extname(target).toLowerCase()] || 'application/octet-stream');
          res.setHeader('Cache-Control', 'no-store');
          if (req.method === 'HEAD') { res.end(); return; }
          const stream = createReadStream(target);
          stream.on('error', () => res.destroy());
          stream.pipe(res);
        } catch (error) {
          if (server.config?.logger) server.config.logger.error('[pet-function] ' + error.message);
          res.statusCode = 500;
          res.end('Shared resources are unavailable; check the build server resource-sync log.');
        }
      });
    },
    closeBundle: {
      // Rollup's closeBundle hooks otherwise run in parallel. Wait for this copy
      // before later host hooks split/compress the canonical game files.
      order: 'pre',
      sequential: true,
      async handler() {
        if (config?.command !== 'build') return;
        const publicRoot = await resources();
        const out = resolve(config.root, config.build.outDir);
        if (config.publicDir) for (const source of files(config.publicDir)) {
          const name = relative(config.publicDir, source);
          if (['games', 'pet-function'].includes(name.split(/[\\/]/)[0])) continue;
          copy(source, join(out, name));
        }
        // A build with emptyOutDir:false must not retain removed resource files.
        for (const namespace of ['games', 'pet-function']) {
          const target = join(out, namespace);
          if (outside(out, target)) throw new Error('Invalid resource output directory: ' + target);
          rmSync(target, { recursive: true, force: true });
        }
        for (const source of files(publicRoot)) copy(source, join(out, relative(publicRoot, source)));
      },
    },
  };
}
