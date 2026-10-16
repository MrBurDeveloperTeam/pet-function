import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, open, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import { createGzip } from 'node:zlib';
import {
  DEFAULT_RESOURCE_PART_BYTES,
  MAX_RESOURCE_CHUNK_BYTES,
  RESOURCE_REPOSITORY,
  RESOURCE_SCHEMA_VERSION,
  validateManifest,
  validateResourcePath,
} from './resource-pack-format.mjs';

const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const sha256 = value => createHash('sha256').update(value).digest('hex');

/**
 * Deliberately small public/.npmignore subset: comments, blank lines, root-relative
 * paths, single `*` wildcards within a segment and trailing `/` directories.
 * Negation, **, ?, character classes and escapes fail instead of silently
 * changing what is published. All .npmignore files themselves are metadata.
 */
export function parseResourceExclusions(text) {
  return text.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#')).map(line => {
    if (line.startsWith('!') || /\*\*|[?\[\]{}\\]/.test(line)) throw new Error(`Unsupported public/.npmignore rule: ${line}`);
    const directory = line.endsWith('/');
    const pattern = line.replace(/^\//, '').replace(/\/$/, '');
    validateResourcePath(pattern.replaceAll('*', 'x'));
    const expression = pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*');
    return new RegExp(`^${expression}${directory ? '(?:/|$)' : '$'}`);
  });
}

function groupFor(resourcePath) {
  const [namespace, category] = resourcePath.split('/');
  if (category && (namespace === 'games' || namespace === 'pet-function')) return `${namespace}/${category}`;
  return namespace === resourcePath ? 'public-root' : `public/${namespace}`;
}

function packId(group) {
  const label = group.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64);
  return `${label}-${sha256(group).slice(0, 12)}`;
}

async function listResources(publicRoot, exclusions) {
  const resources = [];
  const folded = new Set();
  async function visit(relative = '') {
    const directory = path.join(publicRoot, ...relative.split('/').filter(Boolean));
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => compare(a.name, b.name))) {
      const resourcePath = relative ? `${relative}/${entry.name}` : entry.name;
      validateResourcePath(resourcePath);
      if (entry.name === '.npmignore' || exclusions.some(rule => rule.test(resourcePath))) continue;
      if (entry.isSymbolicLink()) throw new Error(`Resource symlinks are not supported: ${resourcePath}`);
      if (entry.isDirectory()) await visit(resourcePath);
      else if (entry.isFile()) {
        if (folded.has(resourcePath.toLowerCase())) throw new Error(`Case-colliding resource: ${resourcePath}`);
        folded.add(resourcePath.toLowerCase());
        const absolute = path.join(publicRoot, ...resourcePath.split('/'));
        const info = await stat(absolute);
        resources.push({ path: resourcePath, absolute, size: info.size, mtimeMs: info.mtimeMs });
      } else throw new Error(`Unsupported resource file: ${resourcePath}`);
    }
  }
  await visit();
  return resources.sort((a, b) => compare(a.path, b.path));
}

async function* recordsFor(files, chunkBytes, fileMetadata) {
  for (const file of files) {
    const hash = createHash('sha256');
    let offset = 0;
    for await (const chunk of createReadStream(file.absolute, { highWaterMark: chunkBytes })) {
      hash.update(chunk);
      yield Buffer.from(`${JSON.stringify([file.path, offset, chunk.toString('base64')])}\n`);
      offset += chunk.length;
    }
    if (!offset) yield Buffer.from(`${JSON.stringify([file.path, 0, ''])}\n`);
    const after = await stat(file.absolute);
    if (offset !== file.size || after.size !== file.size || after.mtimeMs !== file.mtimeMs) throw new Error(`Resource changed while packing: ${file.path}`);
    fileMetadata.set(file.path, { path: file.path, size: offset, sha256: hash.digest('hex') });
  }
}

async function compressPack(files, id, stage, partBytes, chunkBytes, fileMetadata) {
  const parts = [];
  let part;
  const source = Readable.from(recordsFor(files, chunkBytes, fileMetadata));
  const compressed = source.pipe(createGzip({ level: 9, mtime: 0 }));
  source.on('error', error => compressed.destroy(error));
  async function finishPart() {
    if (!part) return;
    await part.handle.close();
    parts.push({ name: part.name, size: part.size, sha256: part.hash.digest('hex') });
    part = undefined;
  }
  try {
    for await (const chunk of compressed) {
      let offset = 0;
      while (offset < chunk.length) {
        if (!part) {
          const name = `resource-pack-${id}.jsonl.gz.part${String(parts.length + 1).padStart(5, '0')}`;
          part = { name, size: 0, hash: createHash('sha256'), handle: await open(path.join(stage, name), 'wx') };
        }
        const data = chunk.subarray(offset, offset + Math.min(partBytes - part.size, chunk.length - offset));
        let written = 0;
        while (written < data.length) {
          const result = await part.handle.write(data.subarray(written));
          if (!result.bytesWritten) throw new Error(`Unable to write resource part: ${part.name}`);
          written += result.bytesWritten;
        }
        part.hash.update(data);
        part.size += data.length;
        offset += data.length;
        if (part.size === partBytes) await finishPart();
      }
    }
    await finishPart();
    return { id, files: files.map(file => file.path), parts };
  } finally {
    source.destroy();
    compressed.destroy();
    if (part) await part.handle.close();
  }
}

/** Build release assets without changing any files in public/. */
export async function buildResourcePacks(root, { outDir = '.resource-packs', partBytes = DEFAULT_RESOURCE_PART_BYTES, chunkBytes = MAX_RESOURCE_CHUNK_BYTES } = {}) {
  if (!Number.isSafeInteger(partBytes) || partBytes < 1 || partBytes > DEFAULT_RESOURCE_PART_BYTES) throw new Error(`partBytes must be between 1 and ${DEFAULT_RESOURCE_PART_BYTES}`);
  if (!Number.isSafeInteger(chunkBytes) || chunkBytes < 1 || chunkBytes > MAX_RESOURCE_CHUNK_BYTES) throw new Error(`chunkBytes must be between 1 and ${MAX_RESOURCE_CHUNK_BYTES}`);
  const packageRoot = path.resolve(root);
  const publicRoot = path.join(packageRoot, 'public');
  const output = path.resolve(packageRoot, outDir);
  const publicRelative = path.relative(publicRoot, output);
  if (!publicRelative || (!publicRelative.startsWith(`..${path.sep}`) && publicRelative !== '..' && !path.isAbsolute(publicRelative))) throw new Error('Resource output must stay outside public/');
  const packageInfo = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  let exclusionText = '';
  try { exclusionText = await readFile(path.join(publicRoot, '.npmignore'), 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const files = await listResources(publicRoot, parseResourceExclusions(exclusionText));
  const groups = new Map();
  for (const file of files) {
    const group = groupFor(file.path);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(file);
  }
  const manifest = { schemaVersion: RESOURCE_SCHEMA_VERSION, version: packageInfo.version, repository: RESOURCE_REPOSITORY, tag: `v${packageInfo.version}`, files: [], packs: [] };
  // Validate release identity before performing potentially expensive compression.
  validateManifest(manifest);
  await mkdir(output, { recursive: true });
  const stage = await mkdtemp(path.join(output, '.build-'));
  const fileMetadata = new Map();
  try {
    for (const group of [...groups.keys()].sort(compare)) {
      manifest.packs.push(await compressPack(groups.get(group), packId(group), stage, partBytes, chunkBytes, fileMetadata));
    }
    manifest.files = files.map(file => fileMetadata.get(file.path));
    validateManifest(manifest);
    for (const pack of manifest.packs) for (const part of pack.parts) await rename(path.join(stage, part.name), path.join(output, part.name));
    const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
    await writeFile(path.join(stage, 'resource-manifest.json'), manifestText);
    await rename(path.join(stage, 'resource-manifest.json'), path.join(output, 'resource-manifest.json'));
    await writeFile(path.join(stage, 'resource-manifest.root.json'), manifestText);
    await rename(path.join(stage, 'resource-manifest.root.json'), path.join(packageRoot, 'resource-manifest.json'));
    return manifest;
  } finally {
    // Only this invocation's generated staging directory is removed.
    if (path.dirname(stage) !== output || !path.basename(stage).startsWith('.build-')) throw new Error('Unsafe resource staging directory');
    await rm(stage, { recursive: true, force: true });
  }
}

async function main() {
  let outDir;
  let partBytes;
  const arguments_ = process.argv.slice(2);
  for (let index = 0; index < arguments_.length; index++) {
    const flag = arguments_[index];
    if (flag === '--output' && arguments_[index + 1]) outDir = arguments_[++index];
    else if (flag === '--part-bytes' && arguments_[index + 1]) {
      const value = arguments_[++index];
      if (!/^\d+$/.test(value)) throw new Error('--part-bytes requires a positive integer');
      partBytes = Number(value);
    } else throw new Error(`Unknown or incomplete argument: ${flag}`);
  }
  const manifest = await buildResourcePacks(process.cwd(), { ...(outDir === undefined ? {} : { outDir }), ...(partBytes === undefined ? {} : { partBytes }) });
  const parts = manifest.packs.flatMap(pack => pack.parts);
  const total = parts.reduce((sum, part) => sum + part.size, 0);
  console.log(`Built ${manifest.files.length} resources in ${manifest.packs.length} packs / ${parts.length} release parts (${(total / 1048576).toFixed(2)} MiB).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
