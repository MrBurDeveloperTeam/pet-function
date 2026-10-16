import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateManifest } from './resource-pack-format.mjs';

const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;

function sourceCatalog(manifest) {
  return {
    schemaVersion: manifest.schemaVersion,
    version: manifest.version,
    repository: manifest.repository,
    tag: manifest.tag,
    files: manifest.files.map(({ path, size, sha256 }) => ({ path, size, sha256 }))
      .sort((left, right) => compare(left.path, right.path)),
    packs: manifest.packs.map(({ id, files }) => ({ id, files: [...files].sort(compare) }))
      .sort((left, right) => compare(left.id, right.id)),
  };
}

/** Pin source content and grouping while allowing another Node/zlib encoder. */
export function assertSameResourceCatalog(expected, actual) {
  validateManifest(expected);
  validateManifest(actual);
  if (JSON.stringify(sourceCatalog(expected)) !== JSON.stringify(sourceCatalog(actual))) {
    throw new Error('Resource release catalog differs: version, source files or pack membership changed. Publish a new version instead of replacing this release.');
  }
  return actual;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const arguments_ = process.argv.slice(2);
    if (arguments_.length !== 2) throw new Error('Usage: node scripts/compare-resource-catalogs.mjs expected.json actual.json');
    const [expected, actual] = await Promise.all(arguments_.map(async filename => JSON.parse(await readFile(resolve(filename), 'utf8'))));
    assertSameResourceCatalog(expected, actual);
    console.log(`Resource release catalog verified: ${actual.tag}, ${actual.files.length} files in ${actual.packs.length} packs.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
