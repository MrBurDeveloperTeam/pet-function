import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAirStrikeAircraftCloud} from '../src/apps/repositories/airStrikeAircraftCloud.mjs';
test('flight XP, score and runs use existing monotonic RPC without writing aircraft tier',async()=>{
 const calls=[];const api=createAirStrikeAircraftCloud({rpc:async(name,args)=>{calls.push([name,args]);return {data:{flight_xp:20,best_score:200,completed_runs:1,aircraft_tier:2}};}});
 assert.deepEqual(await api.syncAirStrikeFlight('owner',{xp:20,best:200,runs:1}),{xp:20,best:200,runs:1});
 assert.deepEqual(calls,[['air_strike_progress_sync',{p_xp:20,p_best:200,p_runs:1}]]);
 await assert.rejects(api.syncAirStrikeFlight('owner',{xp:-1,best:0,runs:0}),/Invalid/);
});
test('aircraft requests a fixed target tier so lost-response retries cannot buy another level',async()=>{
 const calls=[];let purchased=false,charges=0;
 const api=createAirStrikeAircraftCloud({rpc:async(name,args)=>{
  calls.push([name,args]);if(name==='air_strike_aircraft_get')return {data:1};
  if(!purchased){purchased=true;charges++;return {error:Error('response lost')};}
  return {data:{tier:2,coins:400}};
 }});
 assert.equal(await api.loadAirStrikeAircraft('owner'),1);
 await assert.rejects(api.purchaseAirStrikeAircraft('owner',2),/response lost/);
 assert.deepEqual(await api.purchaseAirStrikeAircraft('owner',2),{tier:2,coins:400});
 assert.equal(charges,1);assert.deepEqual(calls.slice(1),Array(2).fill(['air_strike_aircraft_purchase',{p_target:2}]));
});
test('invalid target, authentication, and malformed aircraft receipts are rejected',async()=>{
 const api=createAirStrikeAircraftCloud({rpc:async()=>{throw Error('must not call');}});
 for(const target of [0,1,11,2.5])await assert.rejects(api.purchaseAirStrikeAircraft('owner',target),/Invalid/);
 await assert.rejects(api.loadAirStrikeAircraft(''),/Authentication/);
 for(const data of [null,{tier:1,coins:100},{tier:11,coins:100},{tier:2,coins:-1},{tier:2,coins:'100'}]){
  await assert.rejects(createAirStrikeAircraftCloud({rpc:async()=>({data})}).purchaseAirStrikeAircraft('owner',2));
 }
});
test('complete SQL is atomic, reuses existing wallet, preserves aircraft column, and isolates hurdles',()=>{
 const sql=readFileSync(new URL('../database/air_strike_complete_install.sql',import.meta.url),'utf8');
 assert.equal((sql.match(/^begin;$/gm)||[]).length,1);assert.equal((sql.match(/^commit;$/gm)||[]).length,1);
 assert.match(sql,/add column if not exists aircraft_tier/);
 assert.match(sql,/if tier>=p_target then/);assert.match(sql,/if balance<price then/);
 assert.match(sql,/public\.mutate_pet_coins\(-price\)/);
 assert.match(sql,/air_strike_endless_leaderboard/);
 assert.doesNotMatch(sql.replace(/^--.*$/gm,''),/cat_dash|drop table|truncate|create table.*inventory_pet/i);
});
