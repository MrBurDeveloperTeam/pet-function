import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/pet/internal/PetRoom.tsx',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const joystick=source.slice(source.indexOf('<RoomJoystick'));
const body=joystick.slice(joystick.indexOf('onMove={(x,y)=>{')+'onMove={(x,y)=>{'.length,joystick.indexOf('}}/>'));
function refs(outdoor){
 return {currentRoom:outdoor?'outside':'inside',OUTDOOR_ROOMS:new Set(['outside']),outsideMovementKeysRef:{current:{left:true}},indoorMovementKeysRef:{current:{left:true}},outsidePointerTargetRef:{current:{x:900,y:400}},indoorPetTargetXRef:{current:900},indoorPetTargetYOffsetRef:{current:null}};
}
test('disabling or releasing joystick preserves automatic indoor and outdoor exit routes',()=>{
 for(const outdoor of [false,true]){
  const context=refs(outdoor);vm.runInNewContext(`function move(x,y){${body}};move(0,0);`,context);
  assert.equal(context.indoorPetTargetXRef.current,900);
  assert.equal(context.outsidePointerTargetRef.current.x,900);
  const keys=outdoor?context.outsideMovementKeysRef.current:context.indoorMovementKeysRef.current;
  assert.ok(Object.values(keys).every(value=>value===false));
  vm.runInNewContext(`function move(x,y){${body}};move(1,0);`,context);
  assert.equal(outdoor?context.outsidePointerTargetRef.current:context.indoorPetTargetXRef.current,null);
 }
});
test('stalled room transitions reach loading while active travel continues',()=>{
 const start=source.indexOf('  useEffect(()=>{\n    if(!roomTransition||isRoomTransitionLoading)return;\n    let last=');
 const end=source.indexOf('},[currentRoom,roomTransition,isRoomTransitionLoading]);',start);
 assert.ok(start>=0&&end>start);
 const effect=source.slice(start,end+'},[currentRoom,roomTransition,isRoomTransitionLoading]);'.length);
 for(const moving of [false,true]){
  let tick,loading=false,cleanup;
  const context={...refs(false),roomTransition:{destination:'kitchen'},isRoomTransitionLoading:false,indoorPetXRef:{current:100},indoorPetYOffsetRef:{current:0},outsidePetPosRef:{current:{x:100,y:100}},useEffect:fn=>{cleanup=fn();},window:{setInterval:fn=>{tick=fn;return 1;},clearInterval:()=>{}},setLoadingAnimationKey:()=>{},setIsRoomTransitionLoading:value=>{loading=value;}};
  vm.runInNewContext(effect,context);
  for(let i=0;i<4;i++){if(moving)context.indoorPetXRef.current+=25;tick();}
  assert.equal(loading,!moving);
  cleanup();
 }
});
