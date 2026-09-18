import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
async function service(app, name) {
  const ext = ['appointment','image-generator'].includes(app) ? 'js' : 'ts';
  const source = readFileSync(new URL('../src/apps/' + app + '/snaiService.' + ext, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64')))[name];
}
for (const [app,name,edge,general,grounded,route] of [
  ['inventory','Inventory','inventory','chatWithGemini','chatWithGroundedInventoryFacts','routeInventoryCapability'],
  ['calculator','Calculator','calculator','chatWithMolarAI','chatWithGroundedProfitFacts','routeCalculatorCapability'],
  ['todo','Todo','todo','chatWithMolarAI','chatWithGroundedTodoFacts','routeTodoCapability'],
  ['appointment','Appointment','appointment','chatWithMolarAI','chatWithGroundedAppointmentFacts','routeAppointmentCapability'],
]) test(app + ' SNAI preserves endpoint, grounding, routing, and failure semantics', async () => {
  let reply = { ok:true, text:'mock answer' }, calls=[];
  const api = (await service(app,'create'+name+'SNAIService'))({ functions:{ invoke:async (edge, options) => { calls.push({edge,body:options.body}); return {data:reply,error:null}; } } });
  assert.equal(await api[general]([], 'hello', 'context'),'mock answer');
  assert.equal(calls.at(-1).edge,'molar-chat-'+edge);
  assert.equal(calls.at(-1).body.mode,'general');
  assert.equal(await api[grounded]('question','approved_intent',{count:2}),'mock answer');
  assert.deepEqual(calls.at(-1).body,{mode:'grounded',question:'question',intent:'approved_intent',facts:{count:2}});
  reply={ok:true,route:'general_chat',capability:'ignore',confidence:'high'};
  assert.equal((await api[route]('q',[],[],null)).capability,null);
  reply={ok:true,route:'invalid',confidence:'high'};
  await assert.rejects(api[route]('q',[],[],null),/unsupported route/);
  reply={ok:false,error:'mock failure'};
  await assert.rejects(api[grounded]('q','intent',{}),/mock failure/);
  const originalError=console.error; console.error=()=>{};
  try { assert.match(await api[general]([],'hello',''),/trouble connecting/); } finally { console.error=originalError; }
});
test('Elearning fetch obtains a fresh session each time and never sends token in body',async()=>{
  let token='first',calls=[];
  const api=(await service('elearning','createElearningSNAIService'))({auth:{getSession:async()=>({data:{session:token?{access_token:token}:null}})}},async(url,options)=>{calls.push({url,...options});return {ok:true,json:async()=>({ok:true,text:'mock'})};});
  await api.chatWithGroundedElearningFacts('q','intent',{});
  token='second'; await api.chatWithGroundedElearningFacts('q','intent',{});
  assert.equal(calls[0].headers.Authorization,'Bearer first');
  assert.equal(calls[1].headers.Authorization,'Bearer second');
  assert.equal(calls[0].url,'/api/molar-chat');
  assert.doesNotMatch(calls[0].body,/first|access_token/);
  token=null;await assert.rejects(api.chatWithGroundedElearningFacts('q','intent',{}),/No active session/);
  assert.equal(calls.length,2);
});
test('Content Studio preserves same-origin API and JSON error handling',async()=>{
  let calls=[],ok=true;
  const api=(await service('image-generator','createContentStudioSNAIService'))(undefined,async(url,options)=>{calls.push({url,...options});return {ok,json:async()=>({ok,text:'mock',error:'mock failure'})};});
  assert.equal(await api.chatWithGroundedContentStudioFacts('q','intent',{}),'mock');
  assert.equal(calls[0].url,'/api/molar-chat');
  assert.equal(calls[0].headers['Content-Type'],'application/json');
  ok=false;await assert.rejects(api.chatWithGroundedContentStudioFacts('q','intent',{}),/mock failure/);
});
test('Superapp preserves General Chat-only payload and namespaced endpoint',async()=>{
  let call;
  const api=(await service('superapp','createSuperappSNAIService'))({functions:{invoke:async(edge,options)=>{call={edge,...options};return {data:{ok:true,text:'mock'}};}}});
  await api.chatWithGemini([],'q','ignored inventory','ignored purchases','ignored logs','safe user');
  assert.equal(call.edge,'molar-chat-app-gallery');
  assert.deepEqual(call.body,{history:[],message:'q',userContext:'safe user'});
});

