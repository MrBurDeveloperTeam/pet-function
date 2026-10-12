import test from 'node:test';
import assert from 'node:assert/strict';
import {requiredPetXP,advancePetXP} from '../src/pet/internal/petExperience.mjs';

test('cat level requirements grow gradually',()=>{
 assert.equal(requiredPetXP(1),100);
 assert.equal(requiredPetXP(5),212);
 assert.equal(requiredPetXP(10),442);
 assert.equal(requiredPetXP(20),1202);
 for(let level=2;level<=100;level++)assert.ok(requiredPetXP(level)>requiredPetXP(level-1));
});
test('existing levels are preserved and large rewards carry over multiple levels',()=>{
 assert.deepEqual(advancePetXP(20,75,0),{level:20,xp:75,levelsGained:0});
 assert.deepEqual(advancePetXP(1,99,1),{level:2,xp:0,levelsGained:1});
 assert.deepEqual(advancePetXP(1,0,227),{level:3,xp:5,levelsGained:2});
 assert.deepEqual(advancePetXP(10,400,50),{level:11,xp:8,levelsGained:1});
 let split={level:5,xp:170};
 for(let i=0;i<10;i++)split=advancePetXP(split.level,split.xp,100);
 const combined=advancePetXP(5,170,1000);
 assert.equal(split.level,combined.level);
 assert.equal(split.xp,combined.xp);
});
