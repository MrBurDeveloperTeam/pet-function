import test from 'node:test';
import assert from 'node:assert/strict';
import {AIRCRAFT,levelForXp,normalizeProgress,progressKey,awardRun,flightExperience,upgradeAircraft,UPGRADE_COSTS} from '../src/pet/internal/components/airStrikeProgress.mjs';
test('pet XP reward continues after flight XP cap and rejects malformed results',()=>{
 assert.equal(flightExperience({score:500,outcome:'defeat'}),5);
 assert.equal(flightExperience({score:500,outcome:'victory'}),105);
 assert.equal(awardRun(normalizeProgress({xp:8100}),{score:500,outcome:'victory'}).xp,8100);
 assert.equal(flightExperience({score:-1,outcome:'victory'}),0);
 assert.equal(flightExperience({score:500,outcome:'paused'}),0);
});
test('flight progression is separate, capped and has ten aircraft',()=>{
 assert.equal(AIRCRAFT.length,10);
 for(let lv=1;lv<=10;lv++) assert.equal(levelForXp(100*(lv-1)**2),lv);
 assert.equal(levelForXp(999999),10);
 assert.notEqual(progressKey('a'),progressKey('b'));
 assert.notEqual(progressKey(),progressKey('a'));
 assert.equal(normalizeProgress({level:99,petLevel:99}).xp,0);
});
test('completed flights award score experience and victory bonus, malformed results do not',()=>{
 const first=normalizeProgress({});
 assert.deepEqual(awardRun(first,{score:500,outcome:'defeat'}),{version:3,xp:5,best:500,runs:1,aircraftTier:1,highestCleared:0,endlessBest:0});
 assert.equal(levelForXp(awardRun(first,{score:500,outcome:'victory'}).xp),2);
 assert.equal(awardRun(first,{score:-1,outcome:'victory'}),first);
 assert.equal(awardRun(first,{score:500,outcome:'paused'}),first);
 assert.equal(awardRun(normalizeProgress({xp:8100}),{score:1000000,outcome:'victory'}).xp,8100);
});
test('aircraft upgrades require confirmed pet-wallet payment, not flight XP',async()=>{
 const beginner=normalizeProgress({});let wallet=100,calls=0;
 const spend=async amount=>{calls++;if(wallet<amount)return false;wallet-=amount;return true;};
 const bought=await upgradeAircraft(beginner,spend);
 assert.equal(bought.aircraftTier,2);assert.equal(wallet,0);assert.equal(bought.xp,0);
 assert.deepEqual(await upgradeAircraft(bought,spend),bought);
 assert.deepEqual(await upgradeAircraft(bought,async()=>{throw Error('offline');}),bought);
 const experienced=awardRun(normalizeProgress({xp:8100}),{score:500,outcome:'victory'});
 assert.equal(experienced.aircraftTier,1);assert.equal('coins' in experienced,false);
 let funded=normalizeProgress({});wallet=100000;
 for(const price of UPGRADE_COSTS){const balance=wallet;funded=await upgradeAircraft(funded,spend);assert.equal(balance-wallet,price);}
 assert.equal(funded.aircraftTier,10);const count=calls;
 assert.deepEqual(await upgradeAircraft(funded,spend),funded);assert.equal(calls,count);
 assert.equal(normalizeProgress({xp:900}).aircraftTier,1);
});
