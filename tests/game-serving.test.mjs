import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {sharedGamesPlugin} from '../scripts/vite-games.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
test('Development serves shared games directly and rejects missing/traversal paths',async()=>{
 let middleware;sharedGamesPlugin().configureServer({middlewares:{use(fn){middleware=fn;}}});
 const server=createServer((req,res)=>middleware(req,res,()=>{res.statusCode=418;res.end();}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 try{
  for(const game of ['flappy-cat','pac-cat','tetris','meowdoku']){
   const response=await fetch(base+'/games/'+game+'/index.html?v=test');
   assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
   assert.deepEqual(Buffer.from(await response.arrayBuffer()),readFileSync(join(root,'public/games',game,'index.html')));
  }
  assert.equal((await fetch(base+'/games/missing.js')).status,404);
  assert.equal((await fetch(base+'/games/%2e%2e%2fpackage.json')).status,403);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
