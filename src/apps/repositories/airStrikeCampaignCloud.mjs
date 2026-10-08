function progress(data){
 if(!data||!Number.isInteger(data.highestCleared)||data.highestCleared<0||data.highestCleared>100||!Number.isInteger(data.endlessBest)||data.endlessBest<0||data.endlessBest>100000)throw Error('Invalid campaign cloud save');
 return {highestCleared:data.highestCleared,endlessBest:data.endlessBest};
}
export function createAirStrikeCampaignCloud(client){
 async function rpc(name,args){const {data,error}=await client.rpc(name,args);if(error)throw error;return data;}
 return {
  async loadAirStrikeEndlessLeaderboard(owner){
   if(!owner)throw Error('Authentication required');
   const data=await rpc('air_strike_endless_leaderboard');
   if(!data||!Array.isArray(data.entries)||data.entries.length>51)throw Error('Invalid endless leaderboard');
   return data.entries.map(row=>{
    if(!row||!Number.isSafeInteger(row.rank)||row.rank<1||typeof row.userId!=='string'||typeof row.name!=='string'||!Number.isInteger(row.wave)||row.wave<1||row.wave>100000||typeof row.isYou!=='boolean')throw Error('Invalid endless ranking');
    let avatarUrl=null;try{const url=new URL(row.avatarUrl);if(['https:','http:'].includes(url.protocol))avatarUrl=url.href;}catch{}
    return {rank:row.rank,userId:row.userId,name:row.name.trim().slice(0,80)||'Pilot',avatarUrl,wave:row.wave,isYou:row.isYou};
   });
  },
  async loadAirStrikeCampaign(owner){if(!owner)throw Error('Authentication required');return progress(await rpc('air_strike_campaign_get'));},
  async mergeAirStrikeCampaign(owner,save){if(!owner)throw Error('Authentication required');const p=progress(save);return progress(await rpc('air_strike_campaign_merge',{p_highest:p.highestCleared,p_endless:p.endlessBest}));},
  async recordAirStrikeCampaign(owner,run){
   if(!owner||!run||typeof run.token!=='string'||!Number.isInteger(run.stage)||run.stage<1||run.stage>100||!['campaign','endless'].includes(run.mode)||!['victory','defeat','checkpoint'].includes(run.outcome)||!Number.isInteger(run.wave)||run.wave<0||run.wave>100000)throw Error('Invalid campaign result');
   const data=await rpc('air_strike_campaign_record',{p_run_token:run.token,p_stage:run.stage,p_mode:run.mode,p_outcome:run.outcome,p_wave:run.wave});
   const saved=progress(data);
   if(!Number.isSafeInteger(data.coins)||data.coins<0||!Number.isSafeInteger(data.reward)||data.reward<0)throw Error('Invalid campaign reward receipt');
   return {...saved,coins:data.coins,reward:data.reward};
  }
 };
}
