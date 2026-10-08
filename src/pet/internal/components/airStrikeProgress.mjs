export const AIRCRAFT = [
 ['Rookie','Single engine · Basic cannons',[8,110,288,365]],
 ['Windrunner','Reinforced wings · Twin cannons',[300,100,268,378]],
 ['Twinwing Hunter','Twin engines · Four weapon mounts',[570,90,306,388]],
 ['Armored Guardian','Reinforced armor · Missile racks',[877,85,306,395]],
 ['Blue Falcon','Swept wings · Jet propulsion',[1185,45,343,438]],
 ['Aurora','Energy cannons · Twin thrusters',[6,530,291,430]],
 ['Nightshade','Stealth delta wings · Plasma rails',[301,524,280,435]],
 ['Heavy Eagle','Heavy engines · Energy core',[566,525,316,435]],
 ['Morning Star','Gold armor · High-output reactor',[855,503,320,482]],
 ['Sky Commander','Flagship armor · Multiple weapon arrays',[1151,480,385,538]],
];
export function levelForXp(xp) { return Math.min(10,1+Math.floor(Math.sqrt(Math.max(0,xp)/100))); }
export function normalizeProgress(value) {
 const integer=(v,max)=>Number.isSafeInteger(v)?Math.max(0,Math.min(max,v)):0;
 return {version:3,xp:integer(value?.xp,8100),best:integer(value?.best,1000000),runs:integer(value?.runs,1000000),aircraftTier:Math.max(1,integer(value?.aircraftTier,10)),highestCleared:integer(value?.highestCleared,100),endlessBest:integer(value?.endlessBest,100000)};
}
export function progressKey(userId) { return `sky-patrol:flight-progress:v1:${userId || 'guest'}`; }
export function awardRun(progress,result) {
 if(!Number.isSafeInteger(result?.score)||result.score<0||result.score>1000000||!['victory','defeat'].includes(result.outcome)) return progress;
 const old=normalizeProgress(progress);
 return normalizeProgress({...old,xp:Math.min(8100,old.xp+Math.floor(result.score/100)+(result.outcome==='victory'?100:0)),best:Math.max(old.best,result.score),runs:old.runs+1});
}
export const UPGRADE_COSTS=[100,200,350,550,800,1100,1500,2000,2600];
export async function upgradeAircraft(progress,spend) {
 const old=normalizeProgress(progress),cost=UPGRADE_COSTS[old.aircraftTier-1];
 if(cost===undefined)return old;
 try { if(!await spend(cost))return old; } catch { return old; }
 return {...old,aircraftTier:old.aircraftTier+1};
}
