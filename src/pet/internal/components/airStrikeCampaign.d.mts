import type {FlightProgress} from './airStrikeProgress.mjs';
export const CHAPTERS:string[];
export function stageReward(stage:number,firstClear?:boolean):number;
export function unlockedStage(progress:FlightProgress):number;
export function settleCampaign(progress:FlightProgress,result:{stage:number;mode:string;wave?:number;outcome:string}):{progress:FlightProgress;coins:number};
