export function createAirStrikeTalentCloud(client:any):{
 loadAirStrikeTalents(userId:string):Promise<number[]>;
 purchaseAirStrikeTalent(userId:string,talentId:number):Promise<{talents:number[];coins:number}>;
};
