import assert from 'node:assert/strict';
import test from 'node:test';
import { RunnerPowerupPurchases, runnerPowerupStatus } from '../src/pet/internal/runnerPowerups.ts';

const request = (kind = 'magnet', runId = 'run', requestId = 'opening') => ({ kind, runId, requestId });

test('one opening choice, duplicate in-flight messages, fixed cost and replay', async () => {
    const purchases = new RunnerPowerupPurchases();
    purchases.start('run');
    let debitCount = 0;
    let resolve;
    const spend = amount => { assert.equal(amount, 30); debitCount++; return new Promise(done => { resolve = done; }); };
    const first = purchases.purchase({ ...request(), cost: 0 }, spend);
    const repeated = purchases.purchase(request(), spend);
    assert.equal(first, repeated);
    assert.equal(await purchases.purchase(request('jetpack', 'run', 'other'), spend), false);
    await Promise.resolve();
    assert.equal(debitCount, 1);
    resolve(true);
    assert.equal(await first, true);
    purchases.close();
    assert.equal(await purchases.purchase(request(), spend), false);
    purchases.start('next');
    assert.equal(await purchases.purchase(request('jetpack', 'next'), async amount => amount === 30), true);
});

test('insufficient balance, rejected wallet and stale/invalid messages never grant a free effect', async () => {
    const purchases = new RunnerPowerupPurchases();
    purchases.start('run');
    let calls = 0;
    const spend = async () => { calls++; throw new Error('Insufficient coins'); };
    for (const invalid of [request('speed'), request('magnet', 'old'), request('jetpack', 'run', ''), { ...request(), kind: {} }]) {
        assert.equal(await purchases.purchase(invalid, spend), false);
    }
    assert.equal(calls, 0);
    assert.equal(await purchases.purchase(request(), spend), false);
    assert.equal(await purchases.purchase(request(), spend), false);
    assert.equal(calls, 1);
});

test('timer messages are finite and limited to the ten-second effect window', () => {
    assert.deepEqual(runnerPowerupStatus({ magnet: 12, jetpack: -1, landing: true }), { magnet: 10, jetpack: 0, landing: true });
    for (const invalid of [null, {}, { magnet: Infinity, jetpack: 3 }, { magnet: 3, jetpack: '10' }]) assert.equal(runnerPowerupStatus(invalid), null);
});
