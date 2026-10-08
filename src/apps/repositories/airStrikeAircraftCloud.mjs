export function createAirStrikeAircraftCloud(client){
 const valid=tier=>Number.isInteger(tier)&&tier>=1&&tier<=10;
 return {
  async syncAirStrikeFlight(owner,save){
   if(!owner||!save||!Number.isInteger(save.xp)||save.xp<0||save.xp>8100||!Number.isInteger(save.best)||save.best<0||save.best>1000000||!Number.isInteger(save.runs)||save.runs<0||save.runs>1000000)throw Error('Invalid flight progress');
   const {data,error}=await client.rpc('air_strike_progress_sync',{p_xp:save.xp,p_best:save.best,p_runs:save.runs});if(error)throw error;
   const row=Array.isArray(data)&&data.length===1?data[0]:data;
   if(!row||!Number.isInteger(row.flight_xp)||row.flight_xp<0||row.flight_xp>8100||!Number.isInteger(row.best_score)||row.best_score<0||row.best_score>1000000||!Number.isInteger(row.completed_runs)||row.completed_runs<0||row.completed_runs>1000000)throw Error('Invalid flight progress receipt');
   return {xp:row.flight_xp,best:row.best_score,runs:row.completed_runs};
  },
  async loadAirStrikeAircraft(owner){
   if(!owner)throw Error('Authentication required');
   const {data,error}=await client.rpc('air_strike_aircraft_get');if(error)throw error;
   if(!valid(data))throw Error('Invalid aircraft cloud tier');return data;
  },
  async purchaseAirStrikeAircraft(owner,target){
   if(!owner||!Number.isInteger(target)||target<2||target>10)throw Error('Invalid aircraft purchase');
   const {data,error}=await client.rpc('air_strike_aircraft_purchase',{p_target:target});if(error)throw error;
   if(!data||!valid(data.tier)||data.tier<target||!Number.isSafeInteger(data.coins)||data.coins<0)throw Error('Invalid aircraft receipt');
   return {tier:data.tier,coins:data.coins};
  }
 };
}
