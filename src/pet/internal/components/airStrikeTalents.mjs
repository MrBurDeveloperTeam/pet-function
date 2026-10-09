export const TALENTS = [
 ['Firepower Boost','Damage +10%.'],['Rapid Fire','Fire rate +10%.'],['Starting Skill Choice','Choose one extra starting skill. Three options per choice.'],
 ['Extra Bullet I','Start with two parallel firing lanes.'],['Extra Bullet II','Start with three spread firing lanes, replacing parallel fire.'],
 ['Piercing Rounds I','Bullets pierce one additional enemy. Bosses stop piercing rounds.'],['Piercing Rounds II','Bullets pierce two additional enemies. Bosses stop piercing rounds.'],
 ['Critical Power','Critical damage +20% (200% → 240%). Base critical chance: 10%.'],
 ['Missile Support','Fire a homing missile every 5 seconds for 50% of current base damage.'],
 ['Combat Drone','One drone follows you and deals 50% of current base damage.'],
 ['Drone Missiles','Drones fire homing missiles every 5 seconds for 50% of current base damage.'],
 ['Twin Drones','Two combat drones follow you.'],
 ['Unyielding','Once per stage: survive fatal damage with 1 HP and 2 seconds of invulnerability.'],
 ['Revival','Once per stage: recover 30% HP after fatal damage (at least 1 HP), with 2 seconds of invulnerability.'],
 ['Ultimate Bombardment','Every 30 kills, call an airstrike: deal 100% max HP to basic enemies, 50% to advanced enemies, and 5× current firepower to bosses.'],
].map(([name,description],i)=>({id:i+1,name,description,cost:i<8?(i+1)*100:1400+(i-8)*600}));
export const talentKey = userId => `sky-patrol:talents:v1:${userId||'guest'}`;
export const normalizeTalents = value => Array.isArray(value)?[...new Set(value.filter(id=>Number.isInteger(id)&&id>=1&&id<=15))].sort((a,b)=>a-b):[];
export function reconcileTalentCloud(local,remote){
 const talents=normalizeTalents(remote);
 return {talents,legacy:normalizeTalents(local).filter(id=>!talents.includes(id))};
}
export function talentRequirement(id,owned){
 for(let previous=1;previous<id;previous++)if(!owned.includes(previous))return `Unlock talent ${previous} first`;
 return '';
}
export async function purchaseTalent(owned,id,spend){
 const saved=normalizeTalents(owned),talent=TALENTS.find(t=>t.id===id);
 if(!talent||saved.includes(id)||talentRequirement(id,saved))return saved;
 try{if(!await spend(talent.cost))return saved;}catch{return saved;}
 return normalizeTalents([...saved,id]);
}
