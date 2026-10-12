import test from 'node:test';
import assert from 'node:assert/strict';
import {mobileRoomSize,clampRoomCamera} from '../src/pet/internal/mobileRoomCamera.mjs';
test('portrait and landscape camera never reveal outside room artwork',()=>{
 for(const viewport of [{width:390,height:844},{width:844,height:390},{width:430,height:932},{width:932,height:430},{width:1024,height:768}]){
  const world=mobileRoomSize(viewport.width,viewport.height);
  assert.ok(world.width>=viewport.width&&world.height>=viewport.height);
  assert.ok(Math.abs(world.width/world.height-1862/845)<0.0001);
  for(const x of [-10000,0,world.width/2,10000])for(const y of [-10000,0,world.height/2,10000]){
   const camera=clampRoomCamera(x,y,world,viewport);
   assert.ok(camera.x>=0&&camera.y>=0);
   assert.ok(camera.x+viewport.width<=world.width+0.0001);
   assert.ok(camera.y+viewport.height<=world.height+0.0001);
  }
  assert.deepEqual(clampRoomCamera(10000,10000,world,viewport),{x:world.width-viewport.width,y:world.height-viewport.height});
 }
});
