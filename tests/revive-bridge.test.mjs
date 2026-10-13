import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
test('revival source checks happen in JavaScript before serialized delivery to Godot',()=>{
  const source=fs.readFileSync(new URL('../godot/air-strike/revive_bridge.gd',import.meta.url),'utf8');
  const literal=source.match(/JavaScriptBridge\.eval\(("if\(window\.petReviveListener\).*?")\)/)[1];
  let listener,delivered=[];const parent={},location={origin:'http://localhost:3000'};
  const window={addEventListener(_,fn){listener=fn;},removeEventListener(){},petReviveReceive(json){delivered.push(JSON.parse(json));}};
  vm.runInNewContext(JSON.parse(literal),{window,parent,location,JSON});
  const data={source:'pet-function:revive',runId:1,approved:true};
  listener({origin:location.origin,source:parent,data});assert.deepEqual(delivered,[data]);
  listener({origin:'https://other.test',source:parent,data});listener({origin:location.origin,source:{},data});
  assert.equal(delivered.length,1);
});
