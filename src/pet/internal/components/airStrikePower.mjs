import { normalizeTalents } from './airStrikeTalents.mjs';

// Permanent readiness estimate, not a simulation of a run or a win guarantee.
// Multi-target weapons have discounted weights because not every shot connects.
export function combatPower(aircraftTier, talents = []) {
 const tier = Math.max(1, Math.min(10, Math.floor(Number(aircraftTier) || 1)));
 const owned = normalizeTalents(talents), has = id => owned.includes(id);
 const drones = has(12) ? 2 : has(10) ? 1 : 0;
 const lanes = has(5) ? 2 : has(4) ? 1.55 : 1;
 const piercing = has(7) ? 1.3 : has(6) ? 1.15 : 1;
 const critical = has(8) ? 1.14 / 1.1 : 1;
 const support = drones * .2 + (has(9) ? .04 : 0) + (has(11) ? drones * .04 : 0);
 const survival = 1 + (has(13) ? .15 : 0) + (has(14) ? .2 : 0);
 return Math.round(1000 * (1 + (tier - 1) * .1) * (has(1) ? 1.1 : 1)
  * (has(2) ? 1.1 : 1) * critical * (lanes * piercing + support)
  * survival * (has(3) ? 1.05 : 1) * (has(15) ? 1.15 : 1));
}

export function recommendedPower(stage) {
 const level = Math.max(1, Math.min(100, Math.floor(Number(stage) || 1)));
 const t = (level - 1) / 99;
 // Mirrors campaign HP/damage/count scaling; softened to account for movement
 // and skills earned during the run. Keep recommendations advisory.
 return Math.round(1000 * Math.sqrt((1 + 2.2 * t) * (1 + 1.2 * t) * (1 + 1.6 * t)) / 50) * 50;
}
