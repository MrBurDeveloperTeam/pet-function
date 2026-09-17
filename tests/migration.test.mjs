import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const workspace=resolve(root,'..');
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]);}
test('Package manifest and lockfile versions match',()=>{
 const manifest=JSON.parse(readFileSync(join(root,'package.json')));
 const lock=JSON.parse(readFileSync(join(root,'package-lock.json')));
 assert.equal(lock.version,manifest.version);
 assert.equal(lock.packages[''].version,manifest.version);
});
test('Only E-learning uses the local shared dependency',()=>{
 const host=JSON.parse(readFileSync(join(workspace,'E-learning/package.json')));
 assert.equal(host.dependencies['pet-function'],'file:../pet-function');
 for(const name of ['calculator','appointment','inventory','todo','Image-generator','snabb-superapp','aiboard','AI-Dashboard']){
  const json=JSON.parse(readFileSync(join(workspace,name,'package.json')));
  assert.notEqual(json.dependencies?.['pet-function'],'file:../pet-function',name);
 }
});
for(const game of ['flappy-cat','pac-cat','tetris','meowdoku'])test(`${game}: canonical source and E-learning build output match`,()=>{
 const folder=join(root,'public/games',game);
 const paths=files(folder);assert.ok(paths.length);
 for(const path of paths){
  const suffix=path.slice(folder.length+1);
  const canonical=readFileSync(path);
  assert.deepEqual(readFileSync(join(workspace,'calculator/public/games',game,suffix)),canonical,suffix+' baseline');
  assert.deepEqual(readFileSync(join(workspace,'E-learning/dist/games',game,suffix)),canonical,suffix+' build output');
 }
});
test('Existing E-learning dialogue source remains local',()=>{
 assert.ok(readFileSync(join(workspace,'E-learning/src/components/CatMascot.jsx'),'utf8').length>1000);
});
