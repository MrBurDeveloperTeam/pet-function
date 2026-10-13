import test from 'node:test';
import assert from 'node:assert/strict';
import {REVIVE_COSTS,addWatchedTime} from '../src/pet/internal/reviveRules.mjs';
test('coins and ads use the same three progressive revival slots',()=>{
  assert.deepEqual(REVIVE_COSTS,[200,800,2000]);assert.equal(REVIVE_COSTS[3],undefined);
});
test('ad reward needs actual playback, not buffering, seeking or background time',()=>{
  let watched=0;for(let i=0;i<120;i++)watched=addWatchedTime(watched,.25,.25,true,true);
  assert.equal(watched,30);
  for(const [media,wall,playing,visible] of [[0,10,true,true],[10,10,true,true],[1,1,false,true],[1,1,true,false],[-1,1,true,true]])assert.equal(addWatchedTime(0,media,wall,playing,visible),0);
  assert.equal(addWatchedTime(29.9,.25,.25,true,true),30);
});
