import type {CampaignRun,CampaignSave} from '../../../apps/repositories/airStrikeCampaignCloud.mjs';
export function createCampaignOutbox(storage:Pick<Storage,'getItem'|'setItem'>,userId:string):{
 enqueue(run:CampaignRun):void;size():number;
 flush(send:(run:CampaignRun)=>Promise<CampaignSave&{coins:number;reward:number}>,onReceipt:(receipt:CampaignSave&{coins:number;reward:number})=>void|Promise<void>):Promise<void>;
};
