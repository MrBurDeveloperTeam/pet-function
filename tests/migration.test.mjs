import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {getSharedPetNameStorageKey,resolveCatAuthStatus} from '../dist/cat.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const workspace=resolve(root,'..');
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]);}
test('Package manifest and lockfile versions match',()=>{
 const manifest=JSON.parse(readFileSync(join(root,'package.json')));
 const lock=JSON.parse(readFileSync(join(root,'package-lock.json')));
 assert.equal(lock.version,manifest.version);
 assert.equal(lock.packages[''].version,manifest.version);
});
test('Cat identity cache is account-scoped and auth loading is distinct from guest',()=>{
 assert.equal(getSharedPetNameStorageKey('user-123'),'snabbb_pet:user-123:pet_name');
 assert.equal(getSharedPetNameStorageKey(null),null);
 assert.equal(resolveCatAuthStatus(undefined,true,null),'guest');
 assert.equal(resolveCatAuthStatus(undefined,false,null),'loading');
 assert.equal(resolveCatAuthStatus(undefined,false,'user-123'),'authenticated');
});
test('Inventory manifest targets the new shared GitHub release',()=>{
 const host=JSON.parse(readFileSync(join(workspace,'inventory/package.json')));
 const shared=JSON.parse(readFileSync(join(root,'package.json')));
 assert.equal(host.dependencies['@mrburdeveloperteam/pet-function'],`github:mrburdeveloperteam/pet-function#v${shared.version}`);
});
for(const game of ['flappy-cat','pac-cat','tetris','meowdoku'])test(`${game}: canonical source and Inventory build output match`,()=>{
 // GitHub checkouts can normalize CRLF/LF. Compare the emitted files
 // against the package actually installed by this host, byte for byte.
 const folder=join(workspace,'inventory/node_modules/@mrburdeveloperteam/pet-function/public/games',game);
 const paths=files(folder);assert.ok(paths.length);
 for(const path of paths){
  const suffix=path.slice(folder.length+1);
  const canonical=readFileSync(path);
  assert.deepEqual(readFileSync(join(workspace,'inventory/dist/games',game,suffix)),canonical,suffix+' build output');
 }
});
test('E-learning removes the old implementation and executes only the shared adapter',()=>{
 const source=readFileSync(join(workspace,'E-learning/src/components/CatMascot.jsx'),'utf8');
 assert.doesNotMatch(source,/PET_FUNCTION_ARCHIVE_BEGIN/);
 assert.match(source,/createElearningCatMascot/);
 assert.match(source,/@mrburdeveloperteam\/pet-function\/apps\/elearning/);
});
