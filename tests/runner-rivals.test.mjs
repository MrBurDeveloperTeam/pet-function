import assert from 'node:assert/strict';
import test from 'node:test';
import { RunnerRivals, runnerRecords, runnerAvatarUrl } from '../src/pet/internal/runnerRivals.ts';

const records = () => runnerRecords([
    { rank: 1, userId: 'a', name: 'A', teeth: 500, avatarUrl: 'https://example.com/a.png' },
    { rank: 2, userId: 'b', name: 'B', teeth: 430 },
    { rank: 3, userId: 'me', name: 'You', teeth: 420 },
], 'me');

test('notice opens exactly 100 teeth before a rival and equality needs one more', () => {
    const rivals = new RunnerRivals();
    rivals.start(records().filter(r => r.id !== 'b'));
    assert.equal(rivals.advance(399).target, null);
    assert.equal(rivals.advance(400).target.id, 'a');
    assert.equal(rivals.advance(500).passed.length, 0);
    assert.equal(rivals.target().id, 'a');
    assert.deepEqual(rivals.advance(501).passed.map(r => r.id), ['a']);
    assert.equal(rivals.target(), null);
    assert.equal(rivals.advance(502).passed.length, 0);
});

test('next closest rival, own record exclusion, NPC score jumps and replay', () => {
    const rivals = new RunnerRivals();
    rivals.start(records());
    assert.equal(rivals.advance(330).target.id, 'b');
    assert.equal(rivals.advance(431).target.id, 'a');
    assert.equal(rivals.advance(490).passed.length, 0);
    assert.equal(rivals.advance(520).passed[0].id, 'a');
    rivals.start(records());
    assert.equal(rivals.advance(501).passed.length, 2);
});

test('refreshes and late leaderboard responses cannot replay old crossings', () => {
    const rivals = new RunnerRivals();
    rivals.start([]);
    rivals.advance(450);
    rivals.updateRecords(records());
    assert.equal(rivals.advance(451).passed.length, 0);
    assert.equal(rivals.advance(501).passed.length, 1);
    rivals.updateRecords(records());
    assert.equal(rivals.advance(501).passed.length, 0);
    assert.equal(rivals.advance(10).passed.length, 0);
});

test('ties celebrate once together, invalid rows and unsafe avatars are ignored', () => {
    const rivals = new RunnerRivals();
    rivals.start(runnerRecords([{ userId: 'x', teeth: 100 }, { userId: 'y', teeth: 100 }, { teeth: -1 }, { teeth: '500' }], null));
    assert.equal(rivals.advance(101).passed.length, 2);
    assert.equal(rivals.advance(101).passed.length, 0);
    for (const url of ['javascript:alert(1)', 'data:image/svg+xml,x', '//evil.example/x', 'https://user:secret@example.com/x']) assert.equal(runnerAvatarUrl(url), null);
    assert.equal(runnerAvatarUrl('/avatar.png'), '/avatar.png');
    assert.equal(runnerRecords([{ rank: 1, name: 'Old server', teeth: 500 }], null)[0].avatarUrl, null);
});
