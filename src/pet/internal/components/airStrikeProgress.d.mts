export type FlightProgress = {version:number;xp:number;best:number;runs:number;aircraftTier:number;highestCleared:number;endlessBest:number};
export const AIRCRAFT: [string,string,number[]][];
export function levelForXp(xp:number):number;
export function normalizeProgress(value:unknown):FlightProgress;
export function progressKey(userId?:string|null):string;
export function awardRun(progress:FlightProgress,result:{score:number;outcome:string}):FlightProgress;
export const UPGRADE_COSTS:number[];
export function upgradeAircraft(progress:FlightProgress,spend:(amount:number)=>Promise<boolean>):Promise<FlightProgress>;
