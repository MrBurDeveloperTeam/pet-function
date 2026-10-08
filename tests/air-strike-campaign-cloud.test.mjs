import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAirStrikeCampaignCloud} from '../src/apps/repositories/airStrikeCampaignCloud.mjs';
import {createCampaignOutbox} from '../src/pet/internal/components/airStrikeCampaignOutbox.mjs';

test('open-stage patch removes ordering restriction while retaining settlement protections',()=>{
 const patch=readFileSync(new URL('../database/air_strike_open_stages.sql',import.meta.url),'utf8');
 const source=readFileSync(new URL('../database/air_strike_campaign_cloud.sql',import.meta.url),'utf8');
 const install=readFileSync(new URL('../database/air_strike_complete_install.sql',import.meta.url),'utf8');
 for(const sql of [patch,source,install]){
  assert.ok(!sql.includes("raise exception 'Stage locked'"));
  assert.ok(sql.includes("raise exception 'Endless locked'"));
  assert.ok(sql.includes("p_stage not between 1 and 100"));
  assert.ok(sql.includes("if not played.finished then"));
  assert.ok(sql.includes('public.mutate_pet_coins(reward)'));
 }
});

test('campaign adapter separates migration from rewarded settlements',async()=>{
 const calls=[];const api=createAirStrikeCampaignCloud({rpc:async(name,args)=>{calls.push([name,args]);return {data:{highestCleared:12,endlessBest:0,coins:150,reward:40},error:null};}});
 assert.deepEqual(await api.mergeAirStrikeCampaign('u',{highestCleared:12,endlessBest:0}),{highestCleared:12,endlessBest:0});
 assert.equal((await api.recordAirStrikeCampaign('u',{token:'run',stage:12,mode:'campaign',outcome:'victory',wave:0})).reward,40);
 assert.equal(calls[0][0],'air_strike_campaign_merge');assert.equal(calls[1][0],'air_strike_campaign_record');
 assert.equal(calls[1][1].p_run_token,'run');assert.equal(calls[1][1].p_stage,12);
});
test('pending settlements survive lost responses and keep per-user queues separate',async()=>{
 const values=new Map();const storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
 const run={token:'uuid',stage:1,mode:'campaign',outcome:'victory',wave:0};
 const queue=createCampaignOutbox(storage,'a');queue.enqueue(run);queue.enqueue(run);assert.equal(queue.size(),1);
 await assert.rejects(queue.flush(async()=>{throw Error('offline');},()=>{}));
 assert.equal(createCampaignOutbox(storage,'b').size(),0);
 const restored=createCampaignOutbox(storage,'a');const sent=[];
 await restored.flush(async r=>{sent.push(r);return {reward:0};},receipt=>assert.equal(receipt.reward,0));
 assert.deepEqual(sent,[run]);assert.equal(createCampaignOutbox(storage,'a').size(),0);
});
test('outbox drains new checkpoints added during an in-flight response without concurrent submission',async()=>{
 const storage={getItem:()=>null,setItem:()=>{}};const queue=createCampaignOutbox(storage,'a');
 const run={token:'uuid',stage:100,mode:'endless',outcome:'checkpoint',wave:10};queue.enqueue(run);
 let release;const gate=new Promise(resolve=>release=resolve);const waves=[];
 const task=queue.flush(async r=>{waves.push(r.wave);if(r.wave===10)await gate;return {};},()=>{});
 queue.enqueue({...run,wave:20});assert.equal(queue.flush(()=>{throw Error('parallel');},()=>{}),task);
 release();await task;assert.deepEqual(waves,[10,20]);assert.equal(queue.size(),0);
});
test('endless leaderboard uses its own RPC and rejects invalid results or unsafe avatar URLs',async()=>{
 let called;const row={rank:1,userId:'pilot',name:'Gulu',wave:42,isYou:true,avatarUrl:'javascript:alert(1)'};
 const api=createAirStrikeCampaignCloud({rpc:async name=>{called=name;return {data:{entries:[row]},error:null};}});
 assert.deepEqual(await api.loadAirStrikeEndlessLeaderboard('u'),[{...row,avatarUrl:null}]);assert.equal(called,'air_strike_endless_leaderboard');
 await assert.rejects(api.loadAirStrikeEndlessLeaderboard(''),/Authentication/);
 for(const data of [{entries:[{...row,wave:-1}]},{entries:[{...row,rank:0}]},{entries:null},{entries:[{...row,isYou:'yes'}]}]){
  await assert.rejects(createAirStrikeCampaignCloud({rpc:async()=>({data,error:null})}).loadAirStrikeEndlessLeaderboard('u'));
 }
});
test('SQL explicitly isolates hurdle data and only replaces a strictly higher endless record',()=>{
 const sql=readFileSync(new URL('../database/air_strike_endless_leaderboard.sql',import.meta.url),'utf8').replace(/^--.*$/gm,'');
 assert.doesNotMatch(sql,/cat_dash/i);
 assert.match(sql,/where excluded\.best_wave>air_strike_endless_bests\.best_wave/);
 assert.match(sql,/best_wave desc,achieved_at,user_id/);
 assert.match(sql,/rank<=50 or user_id=uid/);
 assert.match(sql,/revoke all on public\.air_strike_endless_bests from public,anon,authenticated/);
 assert.doesNotMatch(sql,/email/i);
});
