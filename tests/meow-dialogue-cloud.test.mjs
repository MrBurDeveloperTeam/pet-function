import test from 'node:test';
import assert from 'node:assert/strict';
import { createMeowDialogueCloud } from '../src/apps/repositories/meowDialogueCloud.mjs';

function fakeClient(initial = {}) {
  const tables = {
    aiboard_meow_configs: structuredClone(initial.configs ?? [{ id: 'config-a', user_id: 'owner-a' }]),
    aiboard_meow_messages: structuredClone(initial.messages ?? []),
    aiboard_meow_timing: structuredClone(initial.timing ?? []),
  };
  const requests = [];
  let sequence = 0;
  const client = {
    userId: 'owner-a', authError: null, fail: null, beforeExecute: null, afterExecute: null,
    tables, requests,
    auth: { async getUser() { return { data: { user: client.userId ? { id: client.userId } : null }, error: client.authError }; } },
    from(table) {
      const query = { table, operation: 'select', filters: [], order: [], limit: null, cardinality: null, data: null };
      let executed;
      const builder = {
        select(columns) { query.columns = columns; return builder; },
        eq(column, value) { query.filters.push([column, value]); return builder; },
        order(column, options) { query.order.push([column, options]); return builder; },
        limit(limit) { query.limit = limit; return builder; },
        maybeSingle() { query.cardinality = 'maybeSingle'; return builder; },
        single() { query.cardinality = 'single'; return builder; },
        insert(data) { query.operation = 'insert'; query.data = data; return builder; },
        upsert(data, options) { query.operation = 'upsert'; query.data = data; query.options = options; return builder; },
        update(data) { query.operation = 'update'; query.data = data; return builder; },
        delete() { query.operation = 'delete'; return builder; },
        then(resolve, reject) {
          executed ??= Promise.resolve().then(async () => {
            requests.push(structuredClone(query));
            await client.beforeExecute?.(query);
            if (client.fail?.(query)) return { data: null, error: { message: 'simulated database failure' } };
            const rows = tables[table];
            let selected = rows.filter(row => query.filters.every(([key, value]) => row[key] === value));
            if (query.operation === 'upsert') {
              const existing = rows.find(row => row.user_id === query.data.user_id);
              if (existing && query.options?.ignoreDuplicates) selected = [];
              else if (existing) { Object.assign(existing, query.data); selected = [existing]; }
              else { const row = { id: `config-${++sequence}`, ...query.data }; rows.push(row); selected = [row]; }
            } else if (query.operation === 'insert') {
              if (rows.some(row => row.id === query.data.id)) return { data: null, error: { code: '23505', message: 'duplicate primary key' } };
              const row = { id: `message-${++sequence}`, ...query.data };
              rows.push(row); selected = [row];
            } else if (query.operation === 'update') {
              selected.forEach(row => Object.assign(row, query.data));
            } else if (query.operation === 'delete') {
              tables[table] = rows.filter(row => !selected.includes(row));
            }
            selected = [...selected];
            for (const [column, options] of [...query.order].reverse()) {
              selected.sort((a, b) => ((a[column] > b[column]) - (a[column] < b[column])) * (options?.ascending === false ? -1 : 1));
            }
            if (query.limit !== null) selected = selected.slice(0, query.limit);
            if (query.cardinality === 'single' && selected.length !== 1) return { data: null, error: { message: 'not exactly one row' } };
            if (query.cardinality === 'maybeSingle' && selected.length > 1) return { data: null, error: { message: 'more than one row' } };
            const result = { data: structuredClone(query.cardinality ? selected[0] ?? null : selected), error: null };
            return await client.afterExecute?.(query, result) ?? result;
          });
          return executed.then(resolve, reject);
        },
      };
      return builder;
    },
  };
  return client;
}

const normal = { id: 'message-a', config_id: 'config-a', state: 'Normal', message: 'Hello!', is_audio: false, sort_order: 2 };
const audio = { id: 'audio-a', config_id: 'config-a', state: 'Audio', message: 'data:audio/wav;base64,...', is_audio: true, audio_name: 'meow.wav', sort_order: 0 };
const other = { id: 'message-b', config_id: 'config-b', state: 'Normal', message: 'Other account', is_audio: false, sort_order: 0 };

test('load is read-only and returns only the authenticated owner’s non-audio rows', async () => {
  const client = fakeClient({
    configs: [{ id: 'config-a', user_id: 'owner-a' }, { id: 'config-b', user_id: 'owner-b' }],
    messages: [normal, audio, other],
    timing: [{ config_id: 'config-a', state: 'Normal', message_duration_minutes: 0.2, message_interval_minutes: 0.5, disabled: false }],
  });
  const before = structuredClone(client.tables);
  const config = await createMeowDialogueCloud(client).load('owner-a');
  assert.deepEqual(config.presets, [{ id: 'message-a', state: 'Normal', text: 'Hello!' }]);
  assert.deepEqual(config.timing.Normal, { durationMs: 12000, intervalMs: 30000, disabled: false });
  assert.deepEqual(client.tables, before);
  assert.ok(client.requests.every(request => request.operation === 'select'));
  assert.deepEqual(client.requests[0].filters, [['user_id', 'owner-a']]);
});

test('load without an existing config returns empty saved presets without seeding rows', async () => {
  const client = fakeClient({ configs: [] });
  assert.deepEqual(await createMeowDialogueCloud(client).load('owner-a'), { presets: [], timing: {} });
  assert.equal(client.requests.length, 1);
  assert.equal(client.tables.aiboard_meow_configs.length, 0);
});

test('every operation rejects mismatched, signed-out or failed authentication before database queries', async () => {
  for (const identity of [null, 'owner-b', 'auth-error']) {
    const client = fakeClient();
    if (identity === 'auth-error') client.authError = { message: 'invalid jwt', status: 401 };
    else client.userId = identity;
    const repo = createMeowDialogueCloud(client);
    for (const operation of [() => repo.load('owner-a'), () => repo.add('owner-a', 'Normal', 'Hi'), () => repo.update('owner-a', 'message-a', 'Hi'), () => repo.remove('owner-a', 'message-a')]) {
      await assert.rejects(operation, { code: 'MEOW_AUTH_MISMATCH' });
    }
    assert.equal(client.requests.length, 0);
  }
});

test('an absent verified owner is an auth mismatch and never queries a config', async () => {
  const client = fakeClient();
  await assert.rejects(() => createMeowDialogueCloud(client).load(null), { code: 'MEOW_AUTH_MISMATCH' });
  assert.equal(client.requests.length, 0);
});

test('temporary auth network errors fail without masquerading as an account switch', async () => {
  const client = fakeClient();
  client.authError = { message: 'temporary service failure', status: 503, name: 'AuthRetryableFetchError' };
  await assert.rejects(() => createMeowDialogueCloud(client).load('owner-a'), error => {
    assert.match(error.message, /Could not verify/);
    assert.equal(error.code, undefined);
    return true;
  });
  assert.equal(client.requests.length, 0);
});

test('add inserts one plain-text row after existing state messages and preserves all unrelated data', async () => {
  const client = fakeClient({ messages: [normal, audio, other], timing: [{ config_id: 'config-a', state: 'Audio', disabled: false }] });
  const timingsBefore = structuredClone(client.tables.aiboard_meow_timing);
  const preset = await createMeowDialogueCloud(client).add('owner-a', 'Normal', '  My custom line 🐈  ');
  assert.match(preset.id, /^[0-9a-f-]{36}$/);
  assert.equal(preset.state, 'Normal');
  assert.equal(preset.text, 'My custom line 🐈');
  assert.deepEqual(client.tables.aiboard_meow_messages.slice(0, 3), [normal, audio, other]);
  assert.deepEqual(client.tables.aiboard_meow_timing, timingsBefore);
  assert.equal(client.tables.aiboard_meow_messages[3].sort_order, 3);
  assert.ok(!client.requests.some(request => request.operation === 'delete'));
});

test('first add creates only an owned config and one message, leaving timing unseeded', async () => {
  const client = fakeClient({ configs: [] });
  const preset = await createMeowDialogueCloud(client).add('owner-a', 'Hungry', 'A snack?');
  assert.equal(preset.text, 'A snack?');
  assert.deepEqual(client.tables.aiboard_meow_configs, [{ id: 'config-1', user_id: 'owner-a' }]);
  assert.equal(client.tables.aiboard_meow_messages.length, 1);
  assert.deepEqual(client.tables.aiboard_meow_timing, []);
  const upsert = client.requests.find(request => request.operation === 'upsert');
  assert.deepEqual(upsert.options, { onConflict: 'user_id', ignoreDuplicates: true });
});

test('concurrent config creation reloads the owned config when ignoreDuplicates returns no receipt', async () => {
  const client = fakeClient({ configs: [] });
  client.beforeExecute = query => {
    if (query.operation === 'upsert') client.tables.aiboard_meow_configs.push({ id: 'racing-config', user_id: 'owner-a' });
  };
  await createMeowDialogueCloud(client).add('owner-a', 'Normal', 'Hi');
  assert.equal(client.tables.aiboard_meow_configs.length, 1);
  assert.equal(client.tables.aiboard_meow_messages[0].config_id, 'racing-config');
});

test('update and remove require the individual id, owner config and text row kind', async () => {
  const client = fakeClient({ messages: [normal, audio, other] });
  const repo = createMeowDialogueCloud(client);
  await repo.load('owner-a');
  assert.deepEqual(await repo.update('owner-a', 'message-a', '  Edited  '), { id: 'message-a', state: 'Normal', text: 'Edited' });
  assert.equal(client.tables.aiboard_meow_messages[0].sort_order, 2);
  await assert.rejects(() => repo.update('owner-a', 'message-b', 'Wrong owner'), { code: 'MEOW_PRESET_CONFLICT' });
  await assert.rejects(() => repo.update('owner-a', 'audio-a', 'Wrong kind'), { code: 'MEOW_PRESET_CONFLICT' });
  await assert.rejects(() => repo.remove('owner-a', 'audio-a'), { code: 'MEOW_PRESET_CONFLICT' });
  await assert.rejects(() => repo.remove('owner-a', 'message-b'), { code: 'MEOW_PRESET_CONFLICT' });
  await repo.remove('owner-a', 'message-a');
  assert.deepEqual(client.tables.aiboard_meow_messages, [audio, other]);
  for (const query of client.requests.filter(request => ['update', 'delete'].includes(request.operation))) {
    assert.ok(query.filters.some(([key]) => key === 'id'));
    assert.ok(query.filters.some(([key, value]) => key === 'config_id' && value === 'config-a'));
    assert.ok(query.filters.some(([key, value]) => key === 'is_audio' && value === false));
    assert.ok(query.filters.some(([key]) => key === 'message'));
    assert.ok(query.filters.some(([key]) => key === 'state'));
  }
});

test('invalid state/text is rejected before any write, and no-config edits never create records', async () => {
  const client = fakeClient({ configs: [] });
  const repo = createMeowDialogueCloud(client);
  await assert.rejects(() => repo.add('owner-a', 'Audio', 'url'), /valid cat state/);
  await assert.rejects(() => repo.add('owner-a', 'Normal', '  '), /Enter a preset/);
  await assert.rejects(() => repo.update('owner-a', 'id', 'x'.repeat(501)), /500/);
  await assert.rejects(() => repo.update('owner-a', 'id', 'Hi'), /no longer exists/);
  await assert.rejects(() => repo.remove('owner-a', 'id'), /no longer exists/);
  assert.ok(client.requests.every(request => request.operation === 'select'));
});

test('an account switch while finding a config stops subsequent writes and old-owner reads', async () => {
  for (const operation of ['add', 'update', 'remove', 'load']) {
    const client = fakeClient({ messages: [normal] });
    const repo = createMeowDialogueCloud(client);
    if (['update', 'remove'].includes(operation)) await repo.load('owner-a');
    client.beforeExecute = query => { if (query.table === 'aiboard_meow_configs') client.userId = 'owner-b'; };
    await assert.rejects(() => operation === 'load' ? repo.load('owner-a') : operation === 'add' ? repo.add('owner-a', 'Normal', 'Hi') : operation === 'update' ? repo.update('owner-a', 'message-a', 'Hi') : repo.remove('owner-a', 'message-a'), /sign-in changed/i);
    assert.ok(client.requests.every(request => request.operation === 'select'));
    assert.deepEqual(client.tables.aiboard_meow_messages, [normal]);
  }
});

test('database failures are surfaced and failed mutations are never reported as successful', async () => {
  const client = fakeClient({ messages: [normal] });
  const repo = createMeowDialogueCloud(client);
  client.fail = query => query.table === 'aiboard_meow_timing';
  await assert.rejects(() => repo.load('owner-a'), /Could not load/);
  client.fail = query => query.operation === 'insert';
  await assert.rejects(() => repo.add('owner-a', 'Normal', 'Hi'), /Could not add/);
  client.fail = null;
  await repo.load('owner-a');
  client.fail = query => query.operation === 'update';
  await assert.rejects(() => repo.update('owner-a', 'message-a', 'Hi'), /Could not update/);
  client.fail = query => query.operation === 'delete';
  await assert.rejects(() => repo.remove('owner-a', 'message-a'), /Could not remove/);
  assert.deepEqual(client.tables.aiboard_meow_messages, [normal]);
});

test('a competing edit cannot be overwritten or deleted using an older loaded baseline', async () => {
  const client = fakeClient({ messages: [normal, audio] });
  const first = createMeowDialogueCloud(client);
  const second = createMeowDialogueCloud(client);
  await first.load('owner-a');
  await second.load('owner-a');
  await second.update('owner-a', 'message-a', 'Newer text from AIBoard');
  await assert.rejects(() => first.update('owner-a', 'message-a', 'Stale browser draft'), { code: 'MEOW_PRESET_CONFLICT' });
  await assert.rejects(() => first.remove('owner-a', 'message-a'), { code: 'MEOW_PRESET_CONFLICT' });
  assert.equal(client.tables.aiboard_meow_messages[0].message, 'Newer text from AIBoard');
  assert.deepEqual(client.tables.aiboard_meow_messages[1], audio);
  await first.load('owner-a');
  await first.update('owner-a', 'message-a', 'Reviewed newest text');
  assert.equal(client.tables.aiboard_meow_messages[0].message, 'Reviewed newest text');
});

test('a competing deletion never resurrects an old row or reports a stale delete as confirmed', async () => {
  const client = fakeClient({ messages: [normal] });
  const first = createMeowDialogueCloud(client);
  const second = createMeowDialogueCloud(client);
  await first.load('owner-a');
  await second.load('owner-a');
  await second.remove('owner-a', 'message-a');
  await assert.rejects(() => first.update('owner-a', 'message-a', 'Old draft'), { code: 'MEOW_PRESET_CONFLICT' });
  await assert.rejects(() => first.remove('owner-a', 'message-a'), { code: 'MEOW_PRESET_CONFLICT' });
  assert.deepEqual(client.tables.aiboard_meow_messages, []);
});

test('state changes are protected alongside original text, and legacy whitespace is matched exactly', async () => {
  const client = fakeClient({ messages: [{ ...normal, message: '  Hello!  ' }] });
  const repo = createMeowDialogueCloud(client);
  await repo.load('owner-a');
  await repo.update('owner-a', 'message-a', 'First edit', 'Hello!');
  assert.equal(client.tables.aiboard_meow_messages[0].message, 'First edit');
  client.tables.aiboard_meow_messages[0].state = 'Hungry';
  await assert.rejects(() => repo.update('owner-a', 'message-a', 'Wrong state'), { code: 'MEOW_PRESET_CONFLICT' });
  await assert.rejects(() => repo.remove('owner-a', 'message-a'), { code: 'MEOW_PRESET_CONFLICT' });
  assert.equal(client.tables.aiboard_meow_messages[0].state, 'Hungry');
});

test('explicit draft original text still prevents overwrite after a newer background load', async () => {
  const client = fakeClient({ messages: [normal] });
  const repo = createMeowDialogueCloud(client);
  const old = (await repo.load('owner-a')).presets[0];
  client.tables.aiboard_meow_messages[0].message = 'Changed elsewhere';
  await repo.load('owner-a');
  await assert.rejects(() => repo.update('owner-a', old.id, 'Stale draft', old.text), { code: 'MEOW_PRESET_CONFLICT' });
  await assert.rejects(() => repo.remove('owner-a', old.id, old.text), { code: 'MEOW_PRESET_CONFLICT' });
  assert.equal(client.tables.aiboard_meow_messages[0].message, 'Changed elsewhere');
});

test('an unsuccessful load discards old mutation baselines instead of reusing cached personal rows', async () => {
  const client = fakeClient({ messages: [normal] });
  const repo = createMeowDialogueCloud(client);
  await repo.load('owner-a');
  client.fail = query => query.table === 'aiboard_meow_timing';
  await assert.rejects(() => repo.load('owner-a'), /Could not load/);
  client.fail = null;
  const writesBefore = client.requests.filter(query => ['update', 'delete'].includes(query.operation)).length;
  await assert.rejects(() => repo.update('owner-a', 'message-a', 'Must reload first'), { code: 'MEOW_PRESET_CONFLICT' });
  await assert.rejects(() => repo.remove('owner-a', 'message-a'), { code: 'MEOW_PRESET_CONFLICT' });
  assert.equal(client.requests.filter(query => ['update', 'delete'].includes(query.operation)).length, writesBefore);
  assert.deepEqual(client.tables.aiboard_meow_messages, [normal]);
});

test('an insert committed before a dropped response is recovered by the same UUID on retry', async () => {
  const client = fakeClient({ messages: [normal, audio] });
  const repo = createMeowDialogueCloud(client);
  let dropped = false;
  client.afterExecute = query => {
    if (query.operation === 'insert' && !dropped) { dropped = true; throw new Error('connection lost after commit'); }
  };
  await assert.rejects(() => repo.add('owner-a', 'Hungry', 'Dinner time?'), /Could not confirm/);
  const committed = client.tables.aiboard_meow_messages.find(row => row.message === 'Dinner time?');
  assert.ok(committed);
  const receipt = await repo.add('owner-a', 'Hungry', '  Dinner time?  ');
  assert.deepEqual(receipt, { id: committed.id, state: 'Hungry', text: 'Dinner time?' });
  assert.equal(client.tables.aiboard_meow_messages.filter(row => row.message === 'Dinner time?').length, 1);
  assert.equal(client.requests.filter(query => query.operation === 'insert').length, 1);
  assert.deepEqual(client.tables.aiboard_meow_messages.slice(0, 2), [normal, audio]);
});

test('an uncommitted insert retry reuses its intended UUID and succeeds only once', async () => {
  const client = fakeClient();
  const repo = createMeowDialogueCloud(client);
  client.fail = query => query.operation === 'insert';
  await assert.rejects(() => repo.add('owner-a', 'Normal', 'A new line'), /Could not add/);
  const intended = client.requests.find(query => query.operation === 'insert').data.id;
  client.fail = null;
  const receipt = await repo.add('owner-a', 'Normal', 'A new line');
  assert.equal(receipt.id, intended);
  assert.deepEqual(client.requests.filter(query => query.operation === 'insert').map(query => query.data.id), [intended, intended]);
  assert.equal(client.tables.aiboard_meow_messages.length, 1);
});

test('uncertain insert recovery will not claim another editor’s changed row or another config’s row', async () => {
  for (const changed of ['message', 'config_id', 'is_audio']) {
    const client = fakeClient();
    const repo = createMeowDialogueCloud(client);
    client.afterExecute = query => { if (query.operation === 'insert') throw new Error('response dropped'); };
    await assert.rejects(() => repo.add('owner-a', 'Normal', 'New saying'), /Could not confirm/);
    const saved = client.tables.aiboard_meow_messages[0];
    saved[changed] = changed === 'message' ? 'Someone changed this' : changed === 'config_id' ? 'config-b' : true;
    client.afterExecute = null;
    await assert.rejects(() => repo.add('owner-a', 'Normal', 'New saying'));
    assert.equal(client.tables.aiboard_meow_messages.length, 1);
    assert.equal(client.tables.aiboard_meow_messages[0][changed], saved[changed]);
  }
});

test('same-owner reload preserves an uncertain insert identity, while a verified account switch discards it', async () => {
  for (const switchAccount of [false, true]) {
    const client = fakeClient({ configs: [{ id: 'config-a', user_id: 'owner-a' }, { id: 'config-b', user_id: 'owner-b' }] });
    const repo = createMeowDialogueCloud(client);
    client.fail = query => query.operation === 'insert';
    await assert.rejects(() => repo.add('owner-a', 'Normal', 'Private attempt'), /Could not add/);
    const intended = client.requests.find(query => query.operation === 'insert').data.id;
    client.fail = null;
    if (switchAccount) {
      client.userId = 'owner-b';
      assert.deepEqual((await repo.load('owner-b')).presets, []);
      client.userId = 'owner-a';
    }
    await repo.load('owner-a');
    const receipt = await repo.add('owner-a', 'Normal', 'Private attempt');
    if (switchAccount) assert.notEqual(receipt.id, intended);
    else assert.equal(receipt.id, intended);
    assert.equal(client.tables.aiboard_meow_messages.length, 1);
    assert.equal(client.tables.aiboard_meow_messages[0].config_id, 'config-a');
  }
});
