/** Shared, dependency-free validation for the release resource format. */
export const RESOURCE_SCHEMA_VERSION = 1;
export const RESOURCE_REPOSITORY = 'MrBurDeveloperTeam/pet-function';
export const MAX_RESOURCE_CHUNK_BYTES = 1024 * 1024;
export const DEFAULT_RESOURCE_PART_BYTES = 64 * 1024 * 1024;

const sha256Pattern = /^[a-f0-9]{64}$/;
const safeNamePattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const reservedWindowsName = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const versionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?(?:\+[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/;

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label}`);
}

function byteCount(value, label, allowZero = true) {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) throw new Error(`Invalid ${label}`);
}

function checksum(value, label) {
  if (typeof value !== 'string' || !sha256Pattern.test(value)) throw new Error(`Invalid ${label} SHA256`);
}

/** Public-root relative paths only; also safe when restored onto Windows. */
export function validateResourcePath(value) {
  if (typeof value !== 'string' || !value || value.normalize('NFC') !== value || /[\\:\x00-\x1f\x7f<>"|?*]/.test(value)) {
    throw new Error(`Unsafe resource path: ${JSON.stringify(value)}`);
  }
  for (const segment of value.split('/')) {
    if (!segment || segment === '.' || segment === '..' || /[. ]$/.test(segment) || reservedWindowsName.test(segment)) {
      throw new Error(`Unsafe resource path: ${JSON.stringify(value)}`);
    }
  }
  return value;
}

/** Validate the complete graph before trusting URLs, pack names or destinations. */
export function validateManifest(manifest) {
  object(manifest, 'resource manifest');
  if (manifest.schemaVersion !== RESOURCE_SCHEMA_VERSION) throw new Error('Unsupported resource manifest schema');
  if (typeof manifest.version !== 'string' || !versionPattern.test(manifest.version)) throw new Error('Invalid resource manifest version');
  if (manifest.repository !== RESOURCE_REPOSITORY || manifest.tag !== `v${manifest.version}`) throw new Error('Resource manifest release identity mismatch');
  if (!Array.isArray(manifest.files) || !Array.isArray(manifest.packs)) throw new Error('Invalid resource manifest collections');

  const files = new Map();
  const foldedPaths = new Set();
  const pathPrefixes = new Map();
  for (const file of manifest.files) {
    object(file, 'resource file');
    validateResourcePath(file.path);
    const folded = file.path.toLowerCase();
    if (foldedPaths.has(folded)) throw new Error(`Duplicate or case-colliding resource: ${file.path}`);
    foldedPaths.add(folded);
    const segments = file.path.split('/');
    for (let length = 1; length <= segments.length; length++) {
      const prefix = segments.slice(0, length).join('/');
      const prior = pathPrefixes.get(prefix.toLowerCase());
      if (prior && prior !== prefix) throw new Error(`Case-colliding resource directory: ${prefix}`);
      pathPrefixes.set(prefix.toLowerCase(), prefix);
    }
    byteCount(file.size, `resource size: ${file.path}`);
    checksum(file.sha256, file.path);
    files.set(file.path, file);
  }
  for (const folded of foldedPaths) {
    const segments = folded.split('/');
    for (let length = 1; length < segments.length; length++) {
      if (foldedPaths.has(segments.slice(0, length).join('/'))) throw new Error(`Resource file/directory collision: ${folded}`);
    }
  }

  const packIds = new Set();
  const partNames = new Set();
  const assignedPaths = new Set();
  for (const pack of manifest.packs) {
    object(pack, 'resource pack');
    if (typeof pack.id !== 'string' || !safeNamePattern.test(pack.id) || /\.$/.test(pack.id) || pack.id.includes('..') || reservedWindowsName.test(pack.id) || packIds.has(pack.id.toLowerCase())) throw new Error('Invalid or duplicate resource pack id');
    packIds.add(pack.id.toLowerCase());
    if (!Array.isArray(pack.files) || !pack.files.length || !Array.isArray(pack.parts) || !pack.parts.length) throw new Error(`Empty or invalid resource pack: ${pack.id}`);
    for (const path of pack.files) {
      validateResourcePath(path);
      if (!files.has(path) || assignedPaths.has(path)) throw new Error(`Unknown or duplicate packed resource: ${path}`);
      assignedPaths.add(path);
    }
    for (const part of pack.parts) {
      object(part, 'resource part');
      if (typeof part.name !== 'string' || !safeNamePattern.test(part.name) || /\.$/.test(part.name) || part.name.includes('..') || reservedWindowsName.test(part.name) || partNames.has(part.name.toLowerCase())) throw new Error('Unsafe or duplicate resource part name');
      partNames.add(part.name.toLowerCase());
      byteCount(part.size, `resource part size: ${part.name}`, false);
      if (part.size > DEFAULT_RESOURCE_PART_BYTES) throw new Error(`Resource part exceeds ${DEFAULT_RESOURCE_PART_BYTES} bytes: ${part.name}`);
      checksum(part.sha256, part.name);
    }
  }
  if (assignedPaths.size !== files.size) throw new Error('Resource manifest contains files missing from packs');
  return manifest;
}
