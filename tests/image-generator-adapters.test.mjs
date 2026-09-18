import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as shared from '../dist/image-generator.js';

async function baseline(relative) {
 const result = await build({ entryPoints: [fileURLToPath(new URL('../../Image-generator/src/aiExperience/' + relative, import.meta.url))], bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{ name: 'archived-original', setup(b) {
  b.onLoad({ filter: /\.ts$/ }, ({ path }) => {
   const text = readFileSync(path, 'utf8');
   if (!text.startsWith('// PET_FUNCTION_ARCHIVE_BEGIN')) return;
   return { contents: text.split('// PET_FUNCTION_ARCHIVE_END')[0].split(/\r?\n/).slice(2).map(l => l.slice(3)).join('\n'), loader: 'ts' };
  });
 } }] });
 return import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].contents).toString('base64'));
}
const oldInsight = await baseline('resolver/resolveContentStudioInsight.ts');
const oldQuery = await baseline('dataChat/resolver/resolveContentStudioDataQuery.ts');
const oldFollowUp = await baseline('dataChat/router/resolveContentStudioFollowUp.ts');
const stable = x => JSON.parse(JSON.stringify(x, (key, value) => key === 'evaluatedAt' ? undefined : value));
const rows = [{ id: 'g1', type: 'image', status: 'failed', created_at: '2026-09-18T01:00:00Z', prompt: 'PRIVATE-PROMPT', output_url: 'PRIVATE-URL' }];
const projected = shared.projectGenerationsForInsight(rows);
const snapshot = { ownerUserId: 'user1', planStatus: 'ready', plan: 'free', recentGenerationStatus: 'ready', latestGenerationSelection: shared.selectLatestGeneration(projected), recentGenerationsList: projected };
const forbidden = () => { throw Error('Unexpected external call'); };
const services = { supabase: { from: forbidden }, chatWithMolarAI: forbidden, chatWithGroundedContentStudioFacts: forbidden, routeContentStudioCapability: forbidden };
const adapter = overrides => shared.createContentStudioAIAdapter({ ...services, snapshot, userId: 'user1', userContext: '', ...overrides });

test('Image-generator proactive dialogue preserves priorities, unknown and empty states', () => {
 for (const generations of [undefined, [], projected, projected.map(g => ({ ...g, status: 'processing' })), projected.map(g => ({ ...g, status: 'completed' })), projected.map(g => ({ ...g, createdAt: 'invalid' }))]) {
  for (const plan of [null, 'free', 'pro', 'studio']) assert.deepEqual(stable(shared.resolveContentStudioInsight(generations, plan)), stable(oldInsight.resolveContentStudioInsight(generations, plan)));
 }
 assert.ok(!JSON.stringify(projected).includes('PRIVATE-'));
});
for (const intent of ['contentstudio_plan_status', 'contentstudio_recent_generation', 'contentstudio_recent_generations_list']) {
 test(intent + ': parity and account/domain readiness isolation', () => {
  for (const planStatus of ['not_loaded', 'error', 'ready']) for (const recentGenerationStatus of ['not_loaded', 'error', 'ready']) for (const userId of [null, 'user1', 'user2']) {
   const state = { ...snapshot, planStatus, recentGenerationStatus };
   assert.deepEqual(stable(shared.resolveContentStudioDataQuery(intent, state, userId)), stable(oldQuery.resolveContentStudioDataQuery(intent, state, userId)));
   if (userId !== 'user1') assert.equal(shared.resolveContentStudioDataQuery(intent, state, userId).status, 'unavailable');
  }
 });
}
test('Mutation requests refuse before any database or AI call', async () => {
 assert.match((await adapter().sendMessage({ text: 'Delete this image', history: [] })).text, /can't make changes/);
});
test('Stale-account plan questions do not reach an AI transport', async () => {
 assert.equal((await adapter({ userId: 'user2' }).sendMessage({ text: 'What is my plan?', history: [] })).meta.source, 'fallback');
});
test('Grounded generation phrasing receives minimized facts only; follow-up stays local', async () => {
 let facts;
 const a = adapter({ chatWithGroundedContentStudioFacts: async (_q, _intent, data) => { facts = data; return 'Mock grounded answer'; } });
 assert.equal((await a.sendMessage({ text: 'Show my recent generations', history: [] })).meta.source, 'data-chat');
 assert.ok(!JSON.stringify(facts).includes('PRIVATE-'));
 assert.match((await a.sendMessage({ text: 'Why did they fail?', history: [] })).text, /detailed provider error isn't available/);
 a.reset();
});
test('Grounded transport failure uses the original deterministic fallback', async () => {
 const answer = await adapter().sendMessage({ text: 'What is my plan?', history: [] });
 assert.equal(answer.meta.source, 'fallback');
 assert.equal(answer.text, shared.formatGroundedContentStudioFallback('contentstudio_plan_status', shared.resolveContentStudioDataQuery('contentstudio_plan_status', snapshot, 'user1').facts));
});
test('Grounded follow-up matches preserved implementation', () => {
 const context = { appId: 'content-studio', lastIntent: 'contentstudio_recent_generations_list', generation: 1, lastUserQuestion: '', createdAt: '' };
 for (const question of ['Why did they fail?', 'Which was the latest?', 'successful ones', 'last three', 'how many of those', 'unrelated']) for (const userId of ['user1', 'user2']) {
  assert.equal(shared.resolveContentStudioFollowUp(question, context, snapshot, userId), oldFollowUp.resolveContentStudioFollowUp(question, context, snapshot, userId));
 }
});
test('Semantic routing validates capability allowlist and survives transport errors', async () => {
 assert.deepEqual(await shared.createContentStudioCapabilityMatcher(async () => ({ route: 'grounded', capability: 'not_supported' }))('x', [], null), { type: 'unavailable' });
 assert.deepEqual(await shared.createContentStudioCapabilityMatcher(forbidden)('x', [], null), { type: 'unavailable' });
});
