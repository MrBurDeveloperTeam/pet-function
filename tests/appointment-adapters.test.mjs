import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import * as shared from '../dist/appointment.js';

async function baseline(relative) {
 const result=await build({entryPoints:[fileURLToPath(new URL('../../appointment/src/aiExperience/'+relative,import.meta.url))],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'archived-original',setup(b){b.onLoad({filter:/\.ts$/},({path})=>{
  const text=readFileSync(path,'utf8'); if(!text.startsWith('// PET_FUNCTION_ARCHIVE_BEGIN'))return;
  return {contents:text.split('// PET_FUNCTION_ARCHIVE_END')[0].split(/\r?\n/).slice(2).map(l=>l.slice(3)).join('\n'),loader:'ts'};
 });}}]});
 return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].contents).toString('base64'));
}
const oldPool=await baseline('petDialogue/buildAppointmentDialoguePool.ts');
const oldQuery=await baseline('dataChat/resolver/resolveAppointmentDataQuery.ts');
const withoutTimes=x=>JSON.parse(JSON.stringify(x,(key,value)=>key==='evaluatedAt'?undefined:value));
const stableProactiveFields=pool=>withoutTimes(pool).map(candidate=>{
 if(candidate.triggerId!=='appointment_daily_summary')return candidate;
 const {message,messageTemplate,dedupeKey,...stable}=candidate;
 if(stable.facts)delete stable.facts.occupiedRoomUntil;
 return stable;
});
const day=shared.getLocalDateKey(new Date());
const range={start:new Date(2000,0,1).toISOString(),end:new Date(2100,0,1).toISOString()};
const rooms=[{id:'r1',name:'Room 1'}];
const records=[{id:'a1',date:day,startTime:'23:45',endTime:'23:59',status:'confirmed',roomId:'r1',patientId:'p1',dentistId:'s1',treatmentId:'t1',notes:'PRIVATE-NOTES'}];

test('Appointment proactive dialogue preserves original candidates, priority and privacy projections',()=>{
 for(const rows of [[],records,records.map(r=>({...r,status:'cancelled'})),records.map(r=>({...r,startTime:'00:01',endTime:'00:02'}))]){
  const soon=shared.projectAppointmentsForInsight(rows),daily=shared.projectAppointmentsForDailySummary(rows),projectedRooms=shared.projectRoomsForDailySummary(rooms);
  const now=new Date();
  assert.deepEqual(stableProactiveFields(shared.buildAppointmentDialoguePool(soon,daily,projectedRooms,range,now)),stableProactiveFields(oldPool.buildAppointmentDialoguePool(soon,daily,projectedRooms,range,now)));
  assert.ok(!JSON.stringify(soon).includes('PRIVATE-NOTES'));
 }
});
for(const intent of ['appointment_today_count','appointment_soon','appointment_room_usage','appointment_daily_summary','appointment_today_list','appointment_next_appointment']){
 test(intent+': shared data query matches archived implementation',()=>{
  for(const status of ['loading','error','ready']){
   const args=[intent,records,rooms,status,range,[{id:'p1',name:'Test patient'}],[{id:'s1',name:'Test dentist'}],[{id:'t1',name:'Test treatment'}]];
   assert.deepEqual(withoutTimes(shared.resolveAppointmentDataQuery(...args)),withoutTimes(oldQuery.resolveAppointmentDataQuery(...args)));
  }
 });
}
test('Appointment mutations are refused before any AI or database calls',async()=>{
 const forbidden=()=>{throw Error('unexpected external call');};
 const store=shared.createGroundedContextStore();
 const adapter=shared.createAppointmentsMolarAdapter({userContext:'',appointments:records,rooms,appointmentDataStatus:'ready',loadedAppointmentRange:range,groundedContextStore:store,supabase:{from:forbidden},chatWithMolarAI:forbidden,chatWithGroundedAppointmentFacts:forbidden,routeAppointmentCapability:forbidden});
 const answer=await adapter.sendMessage({text:'Cancel this appointment',history:[]});
 assert.match(answer.text,/can't make appointment changes/);
 adapter.reset();assert.equal(store.get(),null);
});
test('Patient schedule questions remain local and are never sent to an AI transport',async()=>{
 const forbidden=()=>{throw Error('unexpected external call');};
 const adapter=shared.createAppointmentsMolarAdapter({userContext:'',appointments:records,rooms,appointmentDataStatus:'ready',loadedAppointmentRange:range,patients:[{id:'p1',name:'Test patient'}],staff:[],treatments:[],groundedContextStore:shared.createGroundedContextStore(),supabase:{from:forbidden},chatWithMolarAI:forbidden,chatWithGroundedAppointmentFacts:forbidden,routeAppointmentCapability:forbidden});
 const answer=await adapter.sendMessage({text:'Show my appointments today',history:[]});
 assert.equal(answer.meta.source,'data-chat');
 assert.ok(!answer.text.includes('PRIVATE-NOTES'));
});
