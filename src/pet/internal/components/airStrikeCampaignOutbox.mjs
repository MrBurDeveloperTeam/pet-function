export function createCampaignOutbox(storage,userId){
 const key=`sky-patrol:campaign-outbox:v1:${userId}`;
 let pending=[];let busy=null;
 try{const data=JSON.parse(storage.getItem(key)||'[]');if(Array.isArray(data))pending=data.filter(r=>r&&typeof r.token==='string'&&Number.isInteger(r.stage)&&r.stage>=1&&r.stage<=100&&['campaign','endless'].includes(r.mode)&&['victory','defeat','checkpoint'].includes(r.outcome)&&Number.isInteger(r.wave)&&r.wave>=0&&r.wave<=100000);}catch{}
 const persist=()=>storage.setItem(key,JSON.stringify(pending));
 return {
  enqueue(run){if(!pending.some(r=>r.token===run.token&&r.outcome===run.outcome&&r.wave===run.wave))pending.push({...run});persist();},
  size:()=>pending.length,
  flush(send,onReceipt){
   if(busy)return busy;
   busy=(async()=>{while(pending.length){const run=pending[0],receipt=await send(run);await onReceipt(receipt);pending.shift();persist();}})().finally(()=>{busy=null;});
   return busy;
  }
 };
}
