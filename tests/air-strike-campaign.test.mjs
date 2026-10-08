import test from 'node:test';
import assert from 'node:assert/strict';
import {CHAPTERS,stageReward,unlockedStage,settleCampaign} from '../src/pet/internal/components/airStrikeCampaign.mjs';
import {normalizeProgress} from '../src/pet/internal/components/airStrikeProgress.mjs';
import {purchaseTalent} from '../src/pet/internal/components/airStrikeTalents.mjs';
test('sequential first clears unlock 100 stages and generate the talent budget',()=>{
 let progress=normalizeProgress({}),coins=0;
 assert.equal(CHAPTERS.length,10);
 for(let stage=1;stage<=100;stage++){
  assert.equal(unlockedStage(progress),stage);
  const settled=settleCampaign(progress,{stage,mode:'campaign',outcome:'victory'});
  coins+=settled.coins;progress=settled.progress;
 }
 assert.equal(progress.highestCleared,100);assert.equal(unlockedStage(progress),100);
 assert.ok(coins>34000&&coins<36000);
 assert.equal(settleCampaign(progress,{stage:100,mode:'campaign',outcome:'victory'}).coins,stageReward(100,false));
});
test('failed or invalid missions grant nothing; any valid stage can be challenged',()=>{
 const old=normalizeProgress({xp:200});
 for(const result of [{stage:1,outcome:'defeat'},{stage:101,outcome:'victory'},{stage:1.5,outcome:'victory'}])
  assert.equal(settleCampaign(old,{...result,mode:'campaign'}).coins,0);
 assert.equal(old.highestCleared,0);
 const first=settleCampaign(old,{stage:1,mode:'campaign',outcome:'victory'});
 assert.equal(first.coins,40);assert.equal(first.progress.highestCleared,1);
 const skipped=settleCampaign(old,{stage:75,mode:'campaign',outcome:'victory'});
 assert.equal(skipped.progress.highestCleared,75);
 assert.equal(skipped.coins,stageReward(75));
 assert.equal(normalizeProgress({highestCleared:500,endlessBest:-3}).highestCleared,100);
});
test('endless records survive defeat without normal-stage first-clear rewards',()=>{
 const progress=normalizeProgress({highestCleared:100,endlessBest:50});
 const result=settleCampaign(progress,{stage:100,mode:'endless',wave:60,outcome:'defeat'});
 assert.equal(result.coins,0);assert.equal(result.progress.endlessBest,60);
 assert.equal(result.progress.highestCleared,100);
});
test('all permanent talents require purchase in order and cost exactly 26000',async()=>{
 let owned=[],charges=0;
 assert.deepEqual(await purchaseTalent([],9,async()=>{throw Error('must not spend');}),[]);
 for(let id=1;id<=15;id++) owned=await purchaseTalent(owned,id,async cost=>{charges+=cost;return true;});
 assert.equal(owned.length,15);assert.equal(charges,26000);
});
