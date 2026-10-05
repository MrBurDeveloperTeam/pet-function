import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../src/pet/internal/footballRewards.ts', import.meta.url), 'utf8');
const exports = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports });
const { footballRewards, FootballSettlement } = exports;
const result = { matchId: 'match-1', elapsedSeconds: 180, homeGoals: 2, awayGoals: 1 };
test('completed wins, draws and losses earn bounded coins and XP', () => {
  assert.equal(footballRewards(result).coins, 90);
  assert.equal(footballRewards(result).xp, 40);
  assert.equal(footballRewards({ ...result, awayGoals: 2 }).coins, 70);
  assert.equal(footballRewards({ ...result, awayGoals: 3 }).xp, 25);
});
test('quit, malformed and incomplete matches do not earn rewards', () => {
  for (const invalid of [null, {}, { ...result, elapsedSeconds: 179 }, { ...result, elapsedSeconds: Infinity },
    { ...result, homeGoals: -1 }, { ...result, homeGoals: 1.5 }, { ...result, awayGoals: 51 }]) {
    assert.equal(footballRewards(invalid), null);
  }
});
test('settlement requires the active match, real elapsed time, and credits exactly once', () => {
  const settlement = new FootballSettlement();
  settlement.start('match-1', 0);
  assert.equal(settlement.complete(result, 1000), null);
  assert.equal(settlement.complete({ ...result, matchId: 'other' }, 200000), null);
  assert.ok(settlement.complete(result, 180000));
  assert.equal(settlement.complete(result, 181000), null);
  settlement.start('match-1', 182000);
  assert.equal(settlement.complete(result, 400000), null);
  settlement.start('match-2', 200000);
  assert.ok(settlement.complete({ ...result, matchId: 'match-2', elapsedSeconds: 210 }, 410000));
});
