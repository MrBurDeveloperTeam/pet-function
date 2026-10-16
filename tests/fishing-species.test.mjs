import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { FISHING_SPECIES, FISH_BY_RARITY, FISH_POOLS, chooseFishingSpecies } from '../src/pet/internal/fishingSpecies.mjs';

function pick(band, boost, tierRoll, speciesRoll) {
  const rolls = [tierRoll, speciesRoll];
  return chooseFishingSpecies(band, boost, () => rolls.shift());
}

test('all 56 unique fish have deployable art and all five tiers contain ten new fish', () => {
  assert.equal(FISHING_SPECIES.length, 56);
  assert.equal(new Set(FISHING_SPECIES.map(fish => fish.id)).size, 56);
  for (const pool of FISH_BY_RARITY) assert.equal(pool.filter(fish => fish.image.endsWith('.webp')).length, 10);
  for (const fish of FISHING_SPECIES) {
    assert.ok(fish.label);
    assert.ok(existsSync(new URL(`../public${fish.image}`, import.meta.url)), fish.image);
  }
});

test('every fish is reachable with equal selection intervals within its chosen rarity', () => {
  const tierRolls = [['white', 0], ['green', .99], ['orange', 0], ['orange', .99], ['red', .99]];
  for (let rarity = 0; rarity < 5; rarity += 1) {
    const [band, tierRoll] = tierRolls[rarity];
    const pool = FISH_BY_RARITY[rarity];
    for (let index = 0; index < pool.length; index += 1) {
      assert.equal(pick(band, 0, tierRoll, (index + .5) / pool.length).id, pool[index].id);
    }
  }
});

test('expansion preserves the previous tier probabilities and rod boost', () => {
  assert.equal(pick('green', 0, 2 / 3 - .00001, 0).rarity, 0);
  assert.equal(pick('green', 0, 2 / 3 + .00001, 0).rarity, 1);
  for (const boost of [0, .45, .9, 1.45, 2.2]) {
    for (const band of ['green', 'orange', 'red']) {
      const [low, high] = FISH_POOLS[band];
      const lowWeight = low.weight * (1 + low.rarity * boost);
      const highWeight = high.weight * (1 + high.rarity * boost);
      const boundary = lowWeight / (lowWeight + highWeight);
      assert.equal(pick(band, boost, boundary - .00001, .99).rarity, low.rarity);
      assert.equal(pick(band, boost, boundary + .00001, .99).rarity, high.rarity);
    }
  }
});

test('power bands never produce a fish outside their allowed tiers', () => {
  for (const [band, tiers] of Object.entries(FISH_POOLS)) {
    for (const boost of [0, 2.2]) {
      for (let roll = 0; roll < 1000; roll += 1) {
        const fish = pick(band, boost, roll / 1000, (999 - roll) / 1000);
        assert.ok(tiers.some(tier => tier.rarity === fish.rarity));
      }
    }
  }
});
