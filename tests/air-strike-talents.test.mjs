import test from 'node:test';
import assert from 'node:assert/strict';
import {TALENTS,normalizeTalents,purchaseTalent,talentKey} from '../src/pet/internal/components/airStrikeTalents.mjs';
test('prices and ownership are valid and isolated by user',()=>{
 assert.deepEqual(TALENTS.map(t=>t.cost),[100,200,300,400,500,600,700,800,1400,2000,2600,3200,3800,4400,5000]);
 assert.deepEqual(normalizeTalents([2,2,1,0,16,'3',4.5]),[1,2]);
 assert.notEqual(talentKey('alice'),talentKey('bob'));
});
test('confirmed purchase only, no duplicate charges or prerequisite bypass',async()=>{
 let charges=0;const spend=async()=>{charges++;return true;};
 assert.deepEqual(await purchaseTalent([],5,spend),[]);assert.equal(charges,0);
 assert.deepEqual(await purchaseTalent([4],5,spend),[4]);assert.equal(charges,0);
 assert.deepEqual(await purchaseTalent([1,2,3,4],5,spend),[1,2,3,4,5]);assert.equal(charges,1);
 assert.deepEqual(await purchaseTalent([1,2,3,4,5],5,spend),[1,2,3,4,5]);assert.equal(charges,1);
 assert.deepEqual(await purchaseTalent([],1,async()=>false),[]);
 assert.deepEqual(await purchaseTalent([],1,async()=>{throw Error('wallet failed');}),[]);
});
