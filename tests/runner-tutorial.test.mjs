import assert from 'node:assert/strict';
import test from 'node:test';
import { hasRunnerTutorialBeenSeen, markRunnerTutorialSeen } from '../src/pet/internal/runnerTutorial.ts';

const makeStorage = () => {
    const values = new Map();
    return {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        values,
    };
};

test('first entry needs teaching and starting it persists the visit', () => {
    const storage = makeStorage();
    assert.equal(hasRunnerTutorialBeenSeen('first-run-user', storage), false);
    markRunnerTutorialSeen('first-run-user', storage);
    assert.equal(hasRunnerTutorialBeenSeen('first-run-user', storage), true);
    assert.equal(storage.values.size, 1);

    // A fresh module represents reopening the application in a new session.
    return import('../src/pet/internal/runnerTutorial.ts?reopened').then(reopened => {
        assert.equal(reopened.hasRunnerTutorialBeenSeen('first-run-user', storage), true);
    });
});

test('first-entry records are isolated by account and guest identity', () => {
    const storage = makeStorage();
    markRunnerTutorialSeen('returning-user', storage);
    assert.equal(hasRunnerTutorialBeenSeen('new-user', storage), false);
    assert.equal(hasRunnerTutorialBeenSeen(null, storage), false);
    markRunnerTutorialSeen(null, storage);
    assert.equal(hasRunnerTutorialBeenSeen('guest', storage), false);
    assert.equal(hasRunnerTutorialBeenSeen(null, storage), true);
});

test('blocked browser storage still remembers teaching for this session', () => {
    const blockedStorage = {
        getItem: () => { throw new Error('Storage blocked'); },
        setItem: () => { throw new Error('Storage blocked'); },
    };
    assert.equal(hasRunnerTutorialBeenSeen('blocked-storage-user', blockedStorage), false);
    assert.doesNotThrow(() => markRunnerTutorialSeen('blocked-storage-user', blockedStorage));
    assert.equal(hasRunnerTutorialBeenSeen('blocked-storage-user', blockedStorage), true);
    markRunnerTutorialSeen('storage-unavailable-user', null);
    assert.equal(hasRunnerTutorialBeenSeen('storage-unavailable-user', null), true);
});
