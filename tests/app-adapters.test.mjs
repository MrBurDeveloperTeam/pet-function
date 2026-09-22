import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import * as repositories from '../dist/apps.js';
import { buildInventoryDialoguePool, createInventoryMolarAdapter, createGroundedContextStore } from '../dist/inventory.js';

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const bundled = await build({ entryPoints: [resolve(workspace, 'inventory/aiExperience/petDialogue/buildInventoryDialoguePool.ts')], bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{
  name: 'read-preserved-baseline',
  setup(build) {
    build.onLoad({filter:/\.ts$/}, ({path}) => {
      const source = readFileSync(path,'utf8');
      if (!source.startsWith('// PET_FUNCTION_ARCHIVE_BEGIN')) return;
      const archived = source.split('// PET_FUNCTION_ARCHIVE_END')[0].split(/\r?\n/).slice(2).map(line=>line.slice(3)).join('\n');
      return {contents:archived,loader:'ts'};
    });
  }
}] });
const baseline = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].contents).toString('base64'));

function chatFixture(overrides = {}) {
  const calls = [];
  const store = createGroundedContextStore();
  const deps = {
    rooms: [{id:'room-1',name:'Clinic',items:[{id:'gloves',name:'Gloves',brand:'',quantity:0,price:1,uom:'pcs',category:'consumables',createdAt:'2026-01-01',batches:[]}]}],
    history: [], logs: [], isLoadingMain: false, groundedContextStore: store,
    supabase: {from(table){ calls.push(['table',table]); return {select(){return this;},in(){return Promise.resolve({data:[],error:null});}};}},
    chatWithGemini: async (...args) => {calls.push(['general',...args]); return 'General answer';},
    chatWithGroundedInventoryFacts: async (...args) => {calls.push(['grounded',...args]); return 'Grounded answer';},
    routeInventoryCapability: async () => ({route:'general_chat',capability:null,confidence:'high',clarification:null}),
    onProposeAction: proposal => calls.push(['proposal',proposal]),
    receiveStock: async () => {throw Error('unexpected mutation');},
    removeStock: async () => {throw Error('unexpected mutation');},
    moveItem: async () => {throw Error('unexpected mutation');},
    ...overrides,
  };
  return {adapter:createInventoryMolarAdapter(deps),calls,store};
}

test('Shared Inventory data chat reads supplied rooms and reset clears conversation context', async () => {
  const {adapter,calls,store} = chatFixture();
  assert.equal((await adapter.sendMessage({text:'Which items are out of stock?',history:[]})).text,'Grounded answer');
  const grounded = calls.find(c=>c[0]==='grounded');
  assert.equal(grounded[2],'inventory_out_of_stock');
  assert.match(JSON.stringify(grounded[3]),/Gloves/);
  assert.ok(!calls.some(c=>c[0]==='general'));
  assert.equal(store.get().lastIntent,'inventory_out_of_stock');
  adapter.reset();
  assert.equal(store.get(),null);
});

test('Shared Inventory general chat retains live inventory context and Gemini history', async () => {
  const {adapter,calls} = chatFixture();
  const history=[{role:'user',text:'Hello'}];
  assert.equal((await adapter.sendMessage({text:'Tell me a joke',history})).text,'General answer');
  const general=calls.find(c=>c[0]==='general');
  assert.deepEqual(general[1],[{role:'user',parts:[{text:'Hello'}]}]);
  assert.match(general[3],/Gloves/);
  assert.ok(calls.some(c=>c[0]==='table' && c[1]==='aiboard_response_target_apps'));
});

test('Shared Inventory never executes model-generated legacy ACTION payloads', async () => {
  const {adapter}=chatFixture({chatWithGemini:async()=>'<ACTION>{"type":"remove","qty":1}</ACTION>Done'});
  const response=await adapter.sendMessage({text:'Tell me a joke',history:[]});
  assert.match(response.text,/No stock was changed/);
  assert.ok(!response.text.includes('<ACTION>'));
});

test('Inventory dialogue candidates preserve original messages, priority, facts and ordering', () => {
  const now = new Date();
  const day = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const yesterday = new Date(now); yesterday.setDate(now.getDate()-1);
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate()+1);
  const item = (id, qty, expiryDate) => ({ id, name: id, createdAt: '2026-01-01', batches: [{ id: id+'-batch', qty, unitPrice: 1, expiryDate }] });
  for (const items of [[], [item('out',0)], [item('low',2)], [item('expired',5,day(yesterday))], [item('soon',20,day(tomorrow))], [item('healthy',50)], [item('negative',-1)], [item('expired',5,day(yesterday)),item('out',0),item('low',2),item('soon',20,day(tomorrow))]]) {
    const rooms = [{ id: 'owner-room', items }];
    const actual = buildInventoryDialoguePool(rooms);
    const expected = baseline.buildInventoryDialoguePool(rooms);
    const stableFields = pool => pool.map(({ evaluatedAt, ...candidate }) => {
      if (candidate.triggerId !== 'inventory_summary') return candidate;
      const { message, messageTemplate, dedupeKey, ...unchangedSummaryFields } = candidate;
      return unchangedSummaryFields;
    });
    assert.deepEqual(stableFields(actual), stableFields(expected));
  }
});

for (const [name, factory] of Object.entries(repositories)) {
  test(`${name} uses injected client and scopes pet snapshot by the supplied user`, async () => {
    const calls = [];
    const row = { pet_name:'mallow', hunger:61, coins:123, updated_at:'2026-01-01T00:00:00Z' };
    const result = { data: row, error: null };
    const query = {
      select(...args) { calls.push(['select',...args]); return this; },
      eq(...args) { calls.push(['eq',...args]); return this; },
      maybeSingle() { return Promise.resolve(result); },
    };
    const client = { from(table) { calls.push(['from',table]); return query; }, rpc() { throw Error('unexpected mutation'); }, auth:{getUser:async()=>({data:{user:{id:'signed-in-user'}}})} };
    const repository = factory(client);
    const snapshot = await repository.loadSnapshot('signed-in-user');
    assert.equal(snapshot.globalUserId, 'signed-in-user');
    assert.equal(snapshot.stats.coins,123);
    assert.ok(calls.some(c=>c[0]==='from' && c[1]==='inventory_pet'));
    assert.ok(calls.some(c=>c[0]==='eq' && c[1]==='user_id' && c[2]==='signed-in-user'));
    result.error = Error('simulated network failure');
    // Preserve Content Studio's existing error-to-null behavior in this
    // mechanical migration; hardening it is a separate behavioral change.
    if (name === 'createContentStudioPetRepository') assert.equal(await repository.loadSnapshot('signed-in-user'), null);
    else await assert.rejects(repository.loadSnapshot('signed-in-user'));
  });
}
