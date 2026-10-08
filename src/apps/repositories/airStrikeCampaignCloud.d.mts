export type CampaignSave={highestCleared:number;endlessBest:number};
export type EndlessRank={rank:number;userId:string;name:string;avatarUrl:string|null;wave:number;isYou:boolean};
export type CampaignRun={token:string;stage:number;mode:string;outcome:string;wave:number};
export function createAirStrikeCampaignCloud(client:any):{
 loadAirStrikeEndlessLeaderboard(owner:string):Promise<EndlessRank[]>;
 loadAirStrikeCampaign(owner:string):Promise<CampaignSave>;
 mergeAirStrikeCampaign(owner:string,save:CampaignSave):Promise<CampaignSave>;
 recordAirStrikeCampaign(owner:string,run:CampaignRun):Promise<CampaignSave&{coins:number;reward:number}>;
};
