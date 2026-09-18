import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as shared from '../dist/calculator.js';

async function baseline(relative) {
 const result = await build({ entryPoints: [fileURLToPath(new URL('../../calculator/aiExperience/' + relative, import.meta.url))], bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{ name: 'archive', setup(b) { b.onLoad({ filter: /\.ts$/ }, ({ path }) => { const text = readFileSync(path, 'utf8'); if (!text.startsWith('// PET_FUNCTION_ARCHIVE_BEGIN')) return; return { contents: text.split('// PET_FUNCTION_ARCHIVE_END')[0].split(/\r?\n/).slice(2).map(l => l.slice(3)).join('\n'), loader: 'ts' }; }); } }] });
 return import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].contents).toString('base64'));
}
const oldClassify = await baseline('dataChat/router/classifyProfitDataIntent.ts');
const oldMutation = await baseline('dataChat/router/isProfitMutationRequest.ts');
const oldInsight = await baseline('resolver/resolveProfitCalculatorInsight.ts');
const stable = value => JSON.parse(JSON.stringify(value, (key, item) => key === 'evaluatedAt' ? undefined : item));

test('Calculator intent classification matches archived implementation', () => {
 for (const q of ['What are my monthly costs?', 'Show my latest saved plan', 'profit last year', 'what if costs rise?', 'hello']) assert.deepEqual(shared.classifyProfitDataIntent(q), oldClassify.classifyProfitDataIntent(q));
});
test('Calculator mutation guard matches archived implementation', () => {
 for (const q of ['Delete my plan', 'Save this forecast', 'How do I save a plan?', 'Show my plan']) assert.equal(shared.isProfitMutationRequest(q), oldMutation.isProfitMutationRequest(q));
});
test('Calculator proactive reminder preserves priority and minimized projection', () => {
 const raw = [{ id: 'p1', name: 'PRIVATE-NAME', date: '2026-09-18T01:00:00Z', type: 'FORECAST', timeframe: 'monthly', inputs: { private: 42 }, results: { netProfit: -1, revenue: 1, timeUsedHours: 1, totalProcedures: 2, isProfitable: false } }];
 const projected = shared.projectSavedPlansForInsight(raw);
 assert.deepEqual(stable(shared.resolveProfitCalculatorInsight(projected)), stable(oldInsight.resolveProfitCalculatorInsight(projected)));
 assert.ok(!JSON.stringify(projected).includes('PRIVATE'));
});
test('Calculator semantic router rejects unknown capabilities and transport failures', async () => {
 assert.deepEqual(await shared.createCalculatorCapabilityMatcher(async () => ({ route: 'grounded', capability: 'unknown' }))('x', [], null), { type: 'unavailable' });
 assert.deepEqual(await shared.createCalculatorCapabilityMatcher(async () => { throw Error('offline'); })('x', [], null), { type: 'unavailable' });
});
