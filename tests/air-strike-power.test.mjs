import test from 'node:test';
import assert from 'node:assert/strict';
import { combatPower, recommendedPower } from '../src/pet/internal/components/airStrikePower.mjs';

test('readiness uses permanent aircraft and talents with replacement upgrades', () => {
 assert.equal(combatPower(1), 1000);
 assert.equal(combatPower(2), 1100);
 assert.equal(combatPower(1, [1]), 1100);
 assert.equal(combatPower(1, [4,5]), combatPower(1, [5]));
 assert.equal(combatPower(1, [6,7]), combatPower(1, [7]));
 assert.equal(combatPower(1, [10,12]), combatPower(1, [12]));
 assert.equal(combatPower(1, [11]), combatPower(1));
 assert.equal(combatPower(1, [1,1,99]), combatPower(1, [1]));
});
test('permanent progression increases power and campaign recommendations never decrease', () => {
 let previous = combatPower(1);
 for(let tier=2;tier<=10;tier++) {const value=combatPower(tier);assert.ok(value>previous);previous=value;}
 previous = combatPower(10);
 for(let id=1;id<=15;id++) {const value=combatPower(10,Array.from({length:id},(_,i)=>i+1));assert.ok(value>previous);previous=value;}
 assert.equal(recommendedPower(1),1000);
 for(let stage=2;stage<=100;stage++) assert.ok(recommendedPower(stage)>=recommendedPower(stage-1));
 assert.equal(recommendedPower(0),recommendedPower(1));
 assert.equal(recommendedPower(101),recommendedPower(100));
});
