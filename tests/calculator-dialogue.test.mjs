import test from 'node:test';
import assert from 'node:assert/strict';
import * as shared from '../dist/calculator.js';

const plan = (overrides = {}) => ({
  id: 'plan-1',
  date: '2026-09-22T01:00:00.000Z',
  timeframe: 'monthly',
  isProfitable: true,
  totalProcedures: 4,
  ...overrides,
});

test('latest unprofitable saved plan uses historical wording and outranks summary', () => {
  const result = shared.resolveProfitCalculatorInsight([
    plan({ id: 'older-profitable', date: '2026-09-22T01:00:00.000Z' }),
    plan({ id: 'latest-loss', date: '2026-09-22T02:00:00.000Z', isProfitable: false }),
  ]);

  assert.equal(result?.triggerId, 'profit_latest_saved_plan_not_profitable');
  assert.equal(result?.message, 'Your latest saved plan was not profitable when saved.');
  assert.equal(result?.sourceRecordId, 'latest-loss');
  assert.equal(result?.dedupeKey, 'profit_latest_saved_plan_not_profitable:latest-loss');
});

test('profitable summary handles zero, singular, plural and invalid procedure counts', () => {
  const cases = [
    [0, 'Your latest saved plan was profitable when saved and included 0 procedures.'],
    [1, 'Your latest saved plan was profitable when saved and included 1 procedure.'],
    [5, 'Your latest saved plan was profitable when saved and included 5 procedures.'],
    [-1, 'Your latest saved plan was profitable when saved.'],
    [1.5, 'Your latest saved plan was profitable when saved.'],
    [undefined, 'Your latest saved plan was profitable when saved.'],
  ];

  for (const [totalProcedures, expected] of cases) {
    assert.equal(
      shared.resolveProfitCalculatorInsight([plan({ totalProcedures })])?.message,
      expected
    );
  }
});

test('unknown profitability or unusable dates produce no fabricated dialogue', () => {
  assert.equal(shared.resolveProfitCalculatorInsight([]), null);
  assert.equal(shared.resolveProfitCalculatorInsight([plan({ isProfitable: 'yes' })]), null);
  assert.equal(shared.resolveProfitCalculatorInsight([plan({ date: 'invalid' })]), null);
  assert.equal(shared.resolveProfitCalculatorInsight([plan({ timeframe: 'sometimes' })]), null);
  assert.equal(shared.resolveProfitCalculatorInsight([plan({ id: '' })]), null);
});

test('damaged historical rows do not break projection or override a valid latest plan', () => {
  const projected = shared.projectSavedPlansForInsight([
    {
      id: 'damaged-old-plan',
      name: 'PRIVATE OLD PLAN',
      date: 'invalid',
      type: 'FORECAST',
      timeframe: 'monthly',
      inputs: { privateProcedure: 99 },
    },
    {
      id: 'valid-latest-plan',
      name: 'PRIVATE LATEST PLAN',
      date: '2026-09-22T03:00:00.000Z',
      type: 'ROI',
      timeframe: 'monthly',
      inputs: { privateProcedure: 2 },
      results: {
        netProfit: 500,
        revenue: 1000,
        timeUsedHours: 2,
        totalProcedures: 2,
        isProfitable: true,
      },
    },
  ]);

  assert.equal(projected.length, 2);
  assert.doesNotMatch(JSON.stringify(projected), /PRIVATE|privateProcedure|netProfit|revenue/);
  assert.equal(
    shared.resolveProfitCalculatorInsight(projected)?.message,
    'Your latest saved plan was profitable when saved and included 2 procedures.'
  );
});
