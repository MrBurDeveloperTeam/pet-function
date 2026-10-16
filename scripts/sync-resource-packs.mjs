import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, mkdtemp, open, readFile, readdir, rename, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createGunzip } from 'node:zlib';
import { DEFAULT_RESOURCE_PART_BYTES, validateManifest, validateResourcePath } from './resource-pack-format.mjs';

const MAX_CHUNK_BYTES = 1024 * 1024;
const MAX_RECORD_BYTES = 2 * 1024 * 1024;
const MAX_METADATA_BYTES = 16 * 1024 * 1024;
const utf8 = new TextDecoder('utf-8', { fatal: true });
const missing = error => error?.code === 'ENOENT';
const hashBytes = bytes => createHash('sha256').update(bytes).digest('hex');

async function isDirectory(path) {
  try { return (await lstat(path)).isDirectory(); }
  catch (error) { if (missing(error)) return false; throw error; }
}

async function digestFile(path, expectedSize) {
  const info = await lstat(path);
  if (!info.isFile() || info.size !== expectedSize) return null;
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function completePublic(directory, manifest) {
  if (!await isDirectory(directory)) return false;
  for (const file of manifest.files) {
    try {
      if (await digestFile(join(directory, file.path), file.size) !== file.sha256) return false;
    } catch (error) {
      if (missing(error) || error?.code === 'ENOTDIR') return false;
      throw error;
    }
  }
  return true;
}

async function writeAll(handle, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const result = await handle.write(bytes, offset, bytes.length - offset);
    if (!result.bytesWritten) throw new Error('Resource file write made no progress.');
    offset += result.bytesWritten;
  }
}

function safeDownloadBase(base) {
  const url = new URL(base.endsWith('/') ? base : base + '/');
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Resource base URL must be an HTTP(S) directory URL without credentials, query or fragment.');
  }
  return url;
}

async function fetchFollowingRedirects(fetchImpl, url, headers, token) {
  let current = new URL(url);
  for (let redirects = 0; redirects <= 8; redirects++) {
    const outgoing = { ...headers };
    // Release asset responses can redirect to storage/CDN hosts. Credentials stay on the GitHub API.
    if (token && current.origin === 'https://api.github.com') outgoing.Authorization = 'Bearer ' + token;
    const response = await fetchImpl(current.href, { headers: outgoing, redirect: 'manual' });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel?.();
      if (!location || redirects === 8) throw new Error('Resource download returned an invalid redirect chain.');
      const next = new URL(location, current);
      if (!['https:', 'http:'].includes(next.protocol) || next.username || next.password) {
        throw new Error('Resource download returned an unsafe redirect.');
      }
      if (current.protocol === 'https:' && next.protocol !== 'https:') throw new Error('Resource download attempted an insecure redirect.');
      current = next;
      continue;
    }
    return response;
  }
  throw new Error('Resource download returned too many redirects.');
}

async function readResponseBytes(response, maxBytes) {
  const chunks = [];
  let total = 0;
  if (!response.body) throw new Error('Resource response contained no body.');
  for await (const value of response.body) {
    const chunk = Buffer.from(value);
    total += chunk.length;
    if (total > maxBytes) throw new Error('Resource response exceeded its declared size limit.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
}

function httpFailure(manifest, status) {
  if (status === 404) return new Error(`Resource release ${manifest.tag} is not available. Publish the matching GitHub Release before installing this package; private repositories also need PET_FUNCTION_GITHUB_TOKEN (or GITHUB_TOKEN/GH_TOKEN) during the host build.`);
  if ([401, 403].includes(status)) return new Error(`Access to resource release ${manifest.tag} was denied (HTTP ${status}). Provide a GitHub token with access to this repository's Releases during the host build.`);
  return new Error(`Resource release ${manifest.tag} could not be downloaded (HTTP ${status}).`);
}

function sourceCatalog(manifest) {
  const sorted = values => values.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'));
  return JSON.stringify({
    schemaVersion: manifest.schemaVersion, version: manifest.version, repository: manifest.repository, tag: manifest.tag,
    files: sorted(manifest.files.map(({ path, size, sha256 }) => ({ path, size, sha256 }))),
    packs: sorted(manifest.packs.map(({ id, files }) => ({ id, files: [...files].sort() }))),
  });
}

function releaseManifest(bytes, expected) {
  let manifest;
  try { manifest = validateManifest(JSON.parse(utf8.decode(bytes))); }
  catch (cause) { throw new Error('The release resource manifest is invalid.', { cause }); }
  if (sourceCatalog(manifest) !== sourceCatalog(expected)) throw new Error('The release resource catalog does not match this installed pet-function version. Republish the matching release resources.');
  return manifest;
}

async function responseManifest(response, expected) {
  if (!response.ok) { await response.body?.cancel?.(); throw httpFailure(expected, response.status); }
  return releaseManifest(await readResponseBytes(response, MAX_METADATA_BYTES), expected);
}

async function makePartSource(manifest, options) {
  const assetsDir = options.assetsDir ?? process.env.PET_FUNCTION_RESOURCE_ASSETS_DIR;
  if (assetsDir) {
    const directory = resolve(assetsDir);
    let catalog = manifest;
    try { catalog = releaseManifest(await readFile(join(directory, 'resource-manifest.json')), manifest); }
    catch (error) { if (!missing(error)) throw error; }
    return { manifest: catalog, sourceForPart: part => createReadStream(join(directory, part.name)) };
  }
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('Resource synchronization requires Node.js 18 or newer with fetch support.');
  const configuredBase = options.baseUrl ?? process.env.PET_FUNCTION_RESOURCE_BASE_URL;
  if (configuredBase) {
    const base = safeDownloadBase(configuredBase);
    const remote = await responseManifest(await fetchFollowingRedirects(fetchImpl, new URL('resource-manifest.json', base), { Accept: 'application/json' }), manifest);
    return { manifest: remote, sourceForPart: async part => {
      const response = await fetchFollowingRedirects(fetchImpl, new URL(part.name, base), { Accept: 'application/octet-stream' });
      if (!response.ok) { await response.body?.cancel?.(); throw httpFailure(manifest, response.status); }
      return response.body;
    } };
  }
  const token = process.env.PET_FUNCTION_GITHUB_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (token) {
    const endpoint = `https://api.github.com/repos/${manifest.repository}/releases/tags/${encodeURIComponent(manifest.tag)}`;
    const response = await fetchFollowingRedirects(fetchImpl, endpoint, {
      Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
    }, token);
    if (!response.ok) { await response.body?.cancel?.(); throw httpFailure(manifest, response.status); }
    let release;
    try { release = JSON.parse(utf8.decode(await readResponseBytes(response, MAX_METADATA_BYTES))); }
    catch (cause) { throw new Error('GitHub returned invalid resource release metadata.', { cause }); }
    if (!Array.isArray(release.assets)) throw new Error('GitHub resource release metadata contains no asset list.');
    const assets = new Map();
    for (const asset of release.assets) {
      if (typeof asset?.name === 'string') {
        if (assets.has(asset.name)) throw new Error('GitHub resource release contains duplicate asset names.');
        assets.set(asset.name, asset);
      }
    }
    const fetchAsset = async part => {
      const asset = assets.get(part.name);
      if (!asset || !Number.isSafeInteger(asset.id) || asset.id <= 0) throw new Error(`Resource release ${manifest.tag} is missing asset ${part.name}. Publish all parts before the npm package.`);
      if (asset.size !== undefined && asset.size !== part.size) throw new Error(`GitHub release asset ${part.name} does not match the resource manifest size.`);
      const response = await fetchFollowingRedirects(fetchImpl,
        `https://api.github.com/repos/${manifest.repository}/releases/assets/${asset.id}`,
        { Accept: 'application/octet-stream', 'X-GitHub-Api-Version': '2022-11-28' }, token);
      if (!response.ok) { await response.body?.cancel?.(); throw httpFailure(manifest, response.status); }
      return response.body;
    };
    const manifestAsset = assets.get('resource-manifest.json');
    if (!manifestAsset || !Number.isSafeInteger(manifestAsset.id) || manifestAsset.id <= 0) throw new Error(`Resource release ${manifest.tag} is missing resource-manifest.json. Publish all resources before the npm package.`);
    const manifestResponse = await fetchFollowingRedirects(fetchImpl,
      `https://api.github.com/repos/${manifest.repository}/releases/assets/${manifestAsset.id}`,
      { Accept: 'application/octet-stream', 'X-GitHub-Api-Version': '2022-11-28' }, token);
    const remote = await responseManifest(manifestResponse, manifest);
    return { manifest: remote, sourceForPart: fetchAsset };
  }
  const base = safeDownloadBase(`https://github.com/${manifest.repository}/releases/download/${encodeURIComponent(manifest.tag)}/`);
  const remote = await responseManifest(await fetchFollowingRedirects(fetchImpl, new URL('resource-manifest.json', base), { Accept: 'application/json' }), manifest);
  return { manifest: remote, sourceForPart: async part => {
    const response = await fetchFollowingRedirects(fetchImpl, new URL(part.name, base), { Accept: 'application/octet-stream' });
    if (!response.ok) { await response.body?.cancel?.(); throw httpFailure(manifest, response.status); }
    return response.body;
  } };
}

async function downloadPart(part, sourceForPart, destination) {
  if (part.size > DEFAULT_RESOURCE_PART_BYTES) throw new Error(`Resource asset ${part.name} exceeds the 64 MiB part limit.`);
  const handle = await open(destination, 'wx');
  const hash = createHash('sha256');
  let length = 0;
  try {
    const source = await sourceForPart(part);
    if (!source || typeof source[Symbol.asyncIterator] !== 'function') throw new Error(`Resource asset ${part.name} contained no downloadable body.`);
    for await (const value of source) {
      const chunk = Buffer.from(value);
      length += chunk.length;
      if (length > part.size) throw new Error(`Resource asset ${part.name} exceeded its declared length.`);
      hash.update(chunk);
      await writeAll(handle, chunk);
    }
    if (length !== part.size) throw new Error(`Resource asset ${part.name} was interrupted or has an incorrect length.`);
    if (hash.digest('hex') !== part.sha256) throw new Error(`Resource asset ${part.name} failed SHA-256 verification.`);
  } finally { await handle.close(); }
}

async function unpackPack(pack, manifestFiles, partPaths, publicDirectory) {
  let index = 0;
  let active = null;
  let buffered = [];
  let bufferedLength = 0;

  async function consumeRecord(bytes) {
    let record;
    try { record = JSON.parse(utf8.decode(bytes)); }
    catch (cause) { throw new Error(`Resource pack ${pack.id} contains an invalid JSON record.`, { cause }); }
    if (!Array.isArray(record) || record.length !== 3 || typeof record[0] !== 'string'
      || !Number.isSafeInteger(record[1]) || record[1] < 0 || typeof record[2] !== 'string') {
      throw new Error(`Resource pack ${pack.id} contains an invalid chunk record.`);
    }
    const [path, offset, encoded] = record;
    validateResourcePath(path);
    if (path !== pack.files[index]) throw new Error(`Resource pack ${pack.id} has an unexpected, duplicate, or out-of-order file: ${path}.`);
    if (encoded.length > Math.ceil(MAX_CHUNK_BYTES / 3) * 4 || encoded.length % 4 !== 0) throw new Error(`Resource chunk for ${path} exceeds the chunk limit or has invalid base64.`);
    const bytesDecoded = Buffer.from(encoded, 'base64');
    if (bytesDecoded.length > MAX_CHUNK_BYTES || bytesDecoded.toString('base64') !== encoded) throw new Error(`Resource chunk for ${path} has invalid base64 or exceeds the chunk limit.`);
    const expected = manifestFiles.get(path);
    if (!active) {
      if (offset !== 0) throw new Error(`Resource file ${path} starts at an invalid offset.`);
      await mkdir(dirname(join(publicDirectory, path)), { recursive: true });
      active = { expected, length: 0, hash: createHash('sha256'), handle: await open(join(publicDirectory, path), 'wx') };
    }
    if (offset !== active.length) throw new Error(`Resource file ${path} contains an overlapping or missing chunk.`);
    if (!bytesDecoded.length && expected.size !== 0) throw new Error(`Resource file ${path} contains an empty chunk.`);
    active.length += bytesDecoded.length;
    if (active.length > expected.size) throw new Error(`Resource file ${path} exceeds its declared length.`);
    active.hash.update(bytesDecoded);
    await writeAll(active.handle, bytesDecoded);
    if (active.length === expected.size) {
      if (active.hash.digest('hex') !== expected.sha256) throw new Error(`Resource file ${path} failed SHA-256 verification.`);
      await active.handle.close();
      active = null;
      index++;
    }
  }

  async function consumeBytes(chunk) {
    let offset = 0;
    while (offset < chunk.length) {
      const newline = chunk.indexOf(10, offset);
      const end = newline < 0 ? chunk.length : newline;
      const slice = chunk.subarray(offset, end);
      bufferedLength += slice.length;
      if (bufferedLength > MAX_RECORD_BYTES) throw new Error(`Resource pack ${pack.id} contains an oversized record.`);
      buffered.push(slice);
      if (newline < 0) break;
      if (!bufferedLength) throw new Error(`Resource pack ${pack.id} contains a blank record.`);
      await consumeRecord(Buffer.concat(buffered, bufferedLength));
      buffered = [];
      bufferedLength = 0;
      offset = newline + 1;
    }
  }

  const source = Readable.from((async function* () {
    for (const path of partPaths) for await (const chunk of createReadStream(path)) yield chunk;
  })());
  const expanded = source.pipe(createGunzip());
  source.on('error', error => expanded.destroy(error));
  try {
    for await (const chunk of expanded) await consumeBytes(chunk);
    if (bufferedLength) throw new Error(`Resource pack ${pack.id} ends with an incomplete record.`);
    if (active || index !== pack.files.length) throw new Error(`Resource pack ${pack.id} is missing one or more files or chunks.`);
  } finally {
    source.destroy();
    expanded.destroy();
    if (active) await active.handle.close();
  }
}

/** Resolve local development assets or restore the exact installed release into an isolated cache. */
export async function ensurePublicResources(packageRoot, options = {}) {
  const root = resolve(packageRoot);
  const publicDirectory = join(root, 'public');
  if (await isDirectory(join(root, 'src')) && await isDirectory(publicDirectory)) return publicDirectory;

  let manifestBytes;
  try { manifestBytes = await readFile(join(root, 'resource-manifest.json')); }
  catch (error) {
    if (!missing(error)) throw error;
    if (await isDirectory(publicDirectory)) return publicDirectory;
    throw new Error('This pet-function package has neither public resources nor a resource manifest. Reinstall the package.');
  }
  let manifest;
  try { manifest = validateManifest(JSON.parse(utf8.decode(manifestBytes))); }
  catch (cause) { throw new Error('The pet-function resource manifest is invalid. Reinstall the matching package version.', { cause }); }
  let packageMetadata;
  try { packageMetadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')); }
  catch (error) { if (!missing(error)) throw error; }
  if (packageMetadata && packageMetadata.version !== manifest.version) throw new Error('The resource manifest version does not match the installed pet-function package version.');
  if (await completePublic(publicDirectory, manifest)) return publicDirectory;

  const cacheRoot = resolve(options.cacheDir ?? process.env.PET_FUNCTION_RESOURCE_CACHE ?? join(tmpdir(), 'pet-function-resources'));
  const bucket = join(cacheRoot, manifest.version + '-' + hashBytes(manifestBytes).slice(0, 24));
  await mkdir(bucket, { recursive: true });
  // Published generations are immutable. Readers keep valid paths even if another caller repairs a corrupt cache.
  const generations = (await readdir(bucket, { withFileTypes: true }))
    .filter(entry => entry.isDirectory() && /^complete-[0-9a-f-]+$/.test(entry.name)).map(entry => entry.name).sort().reverse();
  for (const generation of generations) {
    const cached = join(bucket, generation, 'public');
    if (await completePublic(cached, manifest)) return cached;
  }

  const stage = await mkdtemp(join(bucket, '.stage-'));
  try {
    const distribution = await makePartSource(manifest, options);
    const stagePublic = join(stage, 'public');
    const downloads = join(stage, 'downloads');
    await mkdir(stagePublic);
    await mkdir(downloads);
    const manifestFiles = new Map(manifest.files.map(file => [file.path, file]));
    for (const pack of distribution.manifest.packs) {
      const paths = [];
      for (const part of pack.parts) {
        const path = join(downloads, part.name);
        await downloadPart(part, distribution.sourceForPart, path);
        paths.push(path);
      }
      await unpackPack(pack, manifestFiles, paths, stagePublic);
      for (const path of paths) await unlink(path);
    }
    await rm(downloads, { recursive: true });
    if (!await completePublic(stagePublic, manifest)) throw new Error('Restored pet-function resources failed final integrity verification.');
    const published = join(bucket, 'complete-' + randomUUID());
    await rename(stage, published);
    return join(published, 'public');
  } finally {
    // stage is a unique directory created above, never a caller-supplied directory or an existing cache generation.
    if (dirname(stage) !== bucket || !basename(stage).startsWith('.stage-')) throw new Error('Unsafe resource cache staging directory.');
    await rm(stage, { recursive: true, force: true });
  }
}

async function main(args) {
  let packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const options = {};
  const switches = { '--assets-dir': 'assetsDir', '--cache-dir': 'cacheDir', '--base-url': 'baseUrl' };
  for (let i = 0; i < args.length; i++) {
    const argument = args[i];
    if (argument === '--package-root' || switches[argument]) {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error('Missing value for ' + argument + '.');
      const value = args[++i];
      if (argument === '--package-root') packageRoot = resolve(value);
      else options[switches[argument]] = value;
    } else throw new Error('Unknown resource sync argument: ' + argument + '.');
  }
  process.stdout.write(await ensurePublicResources(packageRoot, options) + '\n');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).catch(error => {
    console.error('pet-function resource sync: ' + error.message);
    process.exitCode = 1;
  });
}
