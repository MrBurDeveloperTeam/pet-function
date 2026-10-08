export function createAirStrikeAircraftCloud(client:any):{
 syncAirStrikeFlight(owner:string,save:{xp:number;best:number;runs:number}):Promise<{xp:number;best:number;runs:number}>;
 loadAirStrikeAircraft(owner:string):Promise<number>;
 purchaseAirStrikeAircraft(owner:string,target:number):Promise<{tier:number;coins:number}>;
};
