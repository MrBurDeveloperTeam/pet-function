import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {transformSync} from 'esbuild';
const source=readFileSync(new URL('../public/games/mobile-performance.js',import.meta.url),'utf8');
function load(mobile=true){
  const canvas={width:300,height:150,style:{}},events={};
  const context={navigator:{userAgent:mobile?'iPhone':'Windows',platform:'',maxTouchPoints:mobile?5:0,hardwareConcurrency:8},matchMedia:()=>({matches:mobile}),innerWidth:440,innerHeight:956,devicePixelRatio:3,document:{getElementById:()=>canvas,addEventListener:()=>{}},setTimeout:callback=>callback(),clearTimeout:()=>{},window:{addEventListener:(name,callback)=>events[name]=callback}};
  vm.runInNewContext(source,context);
  return {api:context.window.PetGamePerformance,canvas,events,context};
}
test('mobile high-density displays have a bounded framebuffer without changing CSS size',()=>{
  const {api,canvas,events,context}=load();
  assert.equal(api.canvasPolicy(2),0);
  assert.equal(canvas.style.width,'440px');assert.equal(canvas.style.height,'956px');
  assert.ok(canvas.width*canvas.height<=2000000);
  assert.ok(canvas.width*canvas.height/(440*956*9)<.45,'DPR 3 fill load remains reduced by over 55% while text uses DPR 2');
  context.innerWidth=956;context.innerHeight=440;events.resize();
  assert.equal(canvas.style.width,'956px');assert.equal(canvas.style.height,'440px');
  assert.ok(Math.abs(canvas.width/canvas.height-956/440)<.005,'Rotation keeps the original aspect ratio');
  for(const [w,h] of [[320,568],[440,956],[1024,1366],[2560,1600]]){
    const size=api.renderSize(w,h,3);assert.ok(size.width*size.height<=2000000);assert.ok(Math.max(size.width,size.height)<=2400);
  }
});
test('desktop retains native density and long-frame timing',()=>{
  const {api,canvas}=load(false);
  assert.equal(api.canvasPolicy(2),2);assert.equal(canvas.width,300);assert.deepEqual(canvas.style,{});
  assert.equal(api.frameDelta(2000),2000);
  const mobile=load().api;assert.equal(mobile.frameDelta(2000),50);assert.equal(mobile.frameDelta(16),16);
});
test('every Godot shell opts into the shared mobile budget',()=>{
  for(const game of ['air-strike','cat-kart','stadium-football','stadium-hurdles','mole-game']){
    const html=readFileSync(new URL(`../public/games/${game}/index.html`,import.meta.url),'utf8');
    assert.match(html,/mobile-performance\.js/);assert.match(html,/canvasPolicy\(2\)/);
    assert.ok(html.indexOf('mobile-performance.js')<html.indexOf('new Engine('));
  }
});
test('mobile fishing clock freezes in the background and resumes without a time jump',()=>{
  const fishing=readFileSync(new URL('../src/pet/internal/components/FishingGame.tsx',import.meta.url),'utf8');
  const body=fishing.match(/const mobileMotionClock=useRef\(0\);\s*useEffect\(\(\)=>\{([\s\S]*?)\n  \},\[touchMode,orientationPaused,phase,tutorialStep\]\);/)[1];
  const frames=new Map(),listeners={};let id=0,pointer=0;
  const context={touchMode:true,orientationPaused:false,phase:'power',tutorialStep:null,mobileMotionClock:{current:0},directionRef:{current:1},reelDirectionRef:{current:1},setMotionTime:()=>{},setPointer:update=>pointer=update(pointer),setReelPointer:()=>{},requestAnimationFrame:callback=>{frames.set(++id,callback);return id;},cancelAnimationFrame:key=>frames.delete(key),document:{hidden:false,addEventListener:(name,callback)=>listeners[name]=callback,removeEventListener:()=>{}}};
  const cleanup=vm.runInNewContext(transformSync(`(function(){${body}})()`,{loader:'ts'}).code,context);
  function frame(time){const [key,callback]=frames.entries().next().value;frames.delete(key);callback(time);}
  frame(0);frame(16);assert.equal(pointer,1.2);
  context.document.hidden=true;listeners.visibilitychange();assert.equal(frames.size,0);
  context.document.hidden=false;listeners.visibilitychange();frame(10016);assert.equal(pointer,1.2,'First resumed frame cannot catch up hidden time');
  frame(10032);assert.equal(pointer,2.4);cleanup();assert.equal(frames.size,0);
  context.phase='ready';vm.runInNewContext(transformSync(`(function(){${body}})()`,{loader:'ts'}).code,context);assert.equal(frames.size,0,'Idle fishing has no render loop');
});
test('mobile puzzle updates reuse cells and touch handlers while desktop still rebuilds',()=>{
  const puzzle=readFileSync(new URL('../public/games/meowdoku/game.js',import.meta.url),'utf8');
  const fn=puzzle.slice(puzzle.indexOf('function renderBoard(animateKey)'),puzzle.indexOf('function toggleMark(key)'));
  class Node {
    constructor(){this.children=[];this.dataset={};this.style={setProperty(){}};this.className='';this.classList={add:name=>this.className+=' '+name};}
    set innerHTML(value){this.children=[];}
    get firstChild(){return this.children[0];}
    appendChild(child){this.children=this.children.filter(item=>item!==child);this.children.push(child);}
    replaceChildren(){this.children=[];}
    querySelector(){return this.children.find(child=>child.className.startsWith('cat-sprite'));}
    setAttribute(){}
  }
  const board=new Node(),state={marks:new Set(),found:new Set(),catActions:new Map(),coachStep:-1};
  const context={window:{PetGamePerformance:{mobile:true}},currentLevel:()=>({n:2,colorGrid:[[0,0],[0,0]],colorPalette:['blue']}),$:()=>board,COLORS:{blue:'#00f'},state,document:{createElement:()=>new Node()},setTimeout:()=>1,clearTimeout:()=>{},toggleMark:()=>{},confirmCat:()=>{}};
  vm.runInNewContext(fn+';globalThis.render=renderBoard;',context);context.render();
  const cell=board.children[0],handler=cell.ontouchend;state.marks.add('0,0');context.render();
  assert.equal(board.children[0],cell);assert.equal(cell.ontouchend,handler);assert.ok(cell.className.includes('marked'));
  state.found.add('0,0');context.render();assert.equal(cell.children.length,1);
  state.found.clear();context.render();assert.equal(cell.children.length,0);
  context.window.PetGamePerformance.mobile=false;context.render();assert.notEqual(board.children[0],cell);
});
