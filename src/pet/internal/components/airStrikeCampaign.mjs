export const CHAPTERS=['Basic Air Combat','Armored Squadrons','Survival Challenge','Priority Targets','Battlefield Support','Elite Modifiers','Formations & Terrain','Bullet Patterns','Combined Builds','Final Challenge'];
export function stageReward(stage,firstClear=true){return Math.round(40*Math.pow(1.035,Math.max(0,Math.min(99,stage-1)))*(firstClear?1:.35));}
export function unlockedStage(progress){return Math.min(100,(progress.highestCleared||0)+1);}
export function settleCampaign(progress,{stage,mode,wave,outcome}){
 if(outcome!=='victory'&&mode!=='endless')return {progress,coins:0};
 if(mode==='endless')return {progress:{...progress,endlessBest:Math.max(progress.endlessBest||0,Number.isSafeInteger(wave)?Math.min(100000,wave):0)},coins:0};
 if(!Number.isSafeInteger(stage)||stage<1||stage>100)return {progress,coins:0};
 return {progress:{...progress,highestCleared:Math.max(progress.highestCleared||0,stage)},coins:stageReward(stage,stage>(progress.highestCleared||0))};
}
