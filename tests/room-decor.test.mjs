import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DECOR_ITEMS,decorKey,emptyDecor,validateDecor,selectDecor} from '../src/pet/internal/roomDecor.mjs';
import {createDecorCloud} from '../src/apps/repositories/decorCloud.mjs';
const owned=()=>({owned:DECOR_ITEMS.map(i=>i.id),selected:{}});
test('12 unique items, three independent slots per room, server prices match',()=>{
 const sql=readFileSync(new URL('../database/pet_room_decor.sql',import.meta.url),'utf8');
 assert.equal(DECOR_ITEMS.length,12);assert.equal(new Set(DECOR_ITEMS.map(decorKey)).size,12);
 for(const room of ['GAMES','BATHROOM','BEDROOM','KITCHEN'])assert.equal(DECOR_ITEMS.filter(i=>i.room===room).length,3);
 for(const i of DECOR_ITEMS)assert.ok(sql.includes(`('${i.id}','${decorKey(i)}',${i.price})`));
});
test('selecting and restoring any slot preserves all other choices and ownership',()=>{
 const initial=owned();let state=initial;
 for(const i of DECOR_ITEMS)state=selectDecor(state,decorKey(i),i.id);
 assert.deepEqual(initial.selected,{});
 state=validateDecor(JSON.parse(JSON.stringify(state)));
 for(const i of DECOR_ITEMS){const restored=selectDecor(state,decorKey(i),null);assert.equal(Object.keys(restored.selected).length,11);assert.deepEqual(restored.owned,state.owned);for(const j of DECOR_ITEMS.filter(j=>j!==i))assert.equal(restored.selected[decorKey(j)],j.id);}
});
test('invalid, unowned, wrong-slot and inherited keys cannot enter saved state',()=>{
 const item=DECOR_ITEMS[0];
 assert.throws(()=>selectDecor(emptyDecor(),decorKey(item),item.id));
 assert.throws(()=>selectDecor(owned(),decorKey(item),DECOR_ITEMS[1].id));
 assert.throws(()=>selectDecor(owned(),'constructor',null));
 for(const value of [null,{}, {owned:['constructor'],selected:{}},{owned:[item.id,item.id],selected:{}},{owned:[],selected:{[decorKey(item)]:item.id}},{owned:[item.id],selected:{'BEDROOM:rug':item.id}},{owned:[],selected:[]},{owned:[null],selected:{}}])assert.throws(()=>validateDecor(value));
});
test('cloud accepts only confirmed purchases and exact slot selections',async()=>{
 const item=DECOR_ITEMS[0],key=decorKey(item);const state=selectDecor(owned(),key,item.id);const calls=[];
 const api=createDecorCloud({rpc:async(name,args)=>{calls.push({name,args});return{data:name==='pet_decor_purchase'?{decor:state,coins:500}:state,error:null};}});
 assert.deepEqual(await api.purchaseDecorItem('a',item.id),{decor:state,coins:500});
 assert.deepEqual(await api.selectDecorItem('a',key,item.id),state);
 assert.deepEqual(calls[1],{name:'pet_decor_select',args:{p_slot:key,p_item_id:item.id}});
 await assert.rejects(()=>api.selectDecorItem('a',key,null),/not saved/);
 const bad=createDecorCloud({rpc:async()=>({data:{decor:emptyDecor(),coins:500},error:null})});
 await assert.rejects(()=>bad.purchaseDecorItem('a',item.id));
 await assert.rejects(()=>bad.loadDecor(''),/Sign in/);
});
test('all generated overlays retain original canvas and are validated outside masks',()=>{
 const manifest=JSON.parse(readFileSync(new URL('./fixtures/art/room-decor.json',import.meta.url)));
 assert.equal(manifest.length,12);
 for(const item of manifest){assert.deepEqual(item.size,[1862,845]);assert.equal(item.outsideMaskUnchanged,true);assert.ok(readFileSync(new URL(`../public/pet-function/room-decor/${item.id}.webp`,import.meta.url)).length>1000);}
});
