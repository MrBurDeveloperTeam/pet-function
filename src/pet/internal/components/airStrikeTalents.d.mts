export type Talent = {id:number;name:string;description:string;cost:number};
export const TALENTS:Talent[];
export function talentKey(userId?:string|null):string;
export function normalizeTalents(value:unknown):number[];
export function reconcileTalentCloud(local:number[],remote:number[]):{talents:number[];legacy:number[]};
export function talentRequirement(id:number,owned:number[]):string;
export function purchaseTalent(owned:number[],id:number,spend:(cost:number)=>Promise<boolean>|boolean):Promise<number[]>;
