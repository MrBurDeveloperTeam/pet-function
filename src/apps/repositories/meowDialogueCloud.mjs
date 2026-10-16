import { MEOW_STATES, normalizeMeowConfiguration, validateMeowText } from '../../cat/meowDialogue.mjs';

const CONFIG_COLUMNS = 'id,user_id';
const MESSAGE_COLUMNS = 'id,state,message,is_audio,sort_order';
const TIMING_COLUMNS = 'state,message_duration_minutes,message_interval_minutes,disabled,updated_at';

function validId(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Per-account CRUD for AIBoard's existing rows; never replaces the whole config. */
export function createMeowDialogueCloud(client) {
  // Only a successfully verified load (or mutation receipt) establishes a row
  // baseline. Never fetch a newer value silently before overwriting a draft.
  let baseline = null;
  let baselineVersion = 0;
  let verifiedOwner;
  const pendingAdds = new Map();

  function authMismatch(message) {
    baseline = null;
    baselineVersion += 1;
    const error = new Error(message);
    error.code = 'MEOW_AUTH_MISMATCH';
    return error;
  }

  async function assertOwner(ownerId) {
    if (!validId(ownerId)) throw authMismatch('Sign in to manage your preset messages.');
    const result = await client.auth.getUser();
    if (result.error) {
      const authCodes = ['session_not_found', 'refresh_token_not_found', 'refresh_token_already_used', 'user_not_found', 'bad_jwt', 'invalid_jwt', 'not_authenticated', 'no_authorization', 'unexpected_audience', 'user_banned'];
      const expiredOrMissing = [401, 403].includes(Number(result.error.status)) || result.error.name === 'AuthSessionMissingError' || authCodes.includes(result.error.code);
      if (expiredOrMissing) throw authMismatch('Your sign-in changed. Please sign in again.');
      throw new Error('Could not verify your sign-in. Try again.');
    }
    const currentOwner = result.data?.user?.id ?? null;
    // A confirmed account switch/sign-out discards private retry text. Temporary
    // auth/network failures do not, so the same owner's uncertain retry is safe.
    if (verifiedOwner !== undefined && verifiedOwner !== currentOwner) {
      baseline = null;
      pendingAdds.clear();
    }
    verifiedOwner = currentOwner;
    if (currentOwner !== ownerId) {
      throw authMismatch('Your sign-in changed. Please sign in again.');
    }
  }

  async function findConfig(ownerId) {
    const result = await client.from('aiboard_meow_configs')
      .select(CONFIG_COLUMNS).eq('user_id', ownerId).maybeSingle();
    if (result.error) throw new Error('Could not load your preset configuration.');
    if (!result.data) return null;
    if (!validId(result.data.id) || result.data.user_id !== ownerId) {
      throw new Error('Could not verify ownership of your preset configuration.');
    }
    return result.data;
  }

  async function ensureConfig(ownerId) {
    const existing = await findConfig(ownerId);
    if (existing) return existing;
    await assertOwner(ownerId);
    const result = await client.from('aiboard_meow_configs')
      .upsert({ user_id: ownerId }, { onConflict: 'user_id', ignoreDuplicates: true })
      .select(CONFIG_COLUMNS).maybeSingle();
    if (result.error) throw new Error('Could not create your preset configuration.');
    // ON CONFLICT DO NOTHING returns no row when another writer created it.
    const config = result.data ?? await findConfig(ownerId);
    if (!config || !validId(config.id) || config.user_id !== ownerId) {
      throw new Error('Could not verify ownership of your preset configuration.');
    }
    return config;
  }

  function mutationPreset(row, expected) {
    const preset = normalizeMeowConfiguration([row]).presets[0];
    if (!preset || preset.text !== expected.text || (expected.id && preset.id !== expected.id) || (expected.state && preset.state !== expected.state)) {
      throw new Error('The saved preset could not be confirmed. Reload and try again.');
    }
    return preset;
  }

  function conflict() {
    const error = new Error('This preset changed in another editor or no longer exists. Reload your sayings before trying again.');
    error.code = 'MEOW_PRESET_CONFLICT';
    return error;
  }

  function originalRow(ownerId, configId, id, expectedText) {
    const row = baseline?.ownerId === ownerId && baseline.configId === configId ? baseline.rows.get(id) : null;
    if (!row) throw conflict();
    if (expectedText !== undefined) {
      const expected = validateMeowText(expectedText);
      // Preserve legacy whitespace when this is still the loaded row, while an
      // editor's explicit original text takes priority over a newer refresh.
      return { state: row.state, message: validateMeowText(row.message) === expected ? row.message : expected };
    }
    return row;
  }

  function rememberRow(ownerId, configId, row) {
    if (baseline?.ownerId !== ownerId || baseline.configId !== configId) {
      baseline = { ownerId, configId, rows: new Map() };
    }
    baseline.rows.set(row.id, { state: row.state, message: row.message });
  }

  async function findIntendedInsert(ownerId, intent) {
    await assertOwner(ownerId);
    const result = await client.from('aiboard_meow_messages').select(MESSAGE_COLUMNS)
      .eq('id', intent.id).eq('config_id', intent.configId).eq('is_audio', false).maybeSingle();
    if (result.error) throw new Error('Could not confirm the saved preset. Keep your text and retry.');
    if (!result.data) return null;
    const preset = mutationPreset(result.data, { id: intent.id, state: intent.state, text: intent.message });
    await assertOwner(ownerId);
    rememberRow(ownerId, intent.configId, result.data);
    return preset;
  }

  return {
    async load(ownerId) {
      const version = ++baselineVersion;
      baseline = null;
      await assertOwner(ownerId);
      const config = await findConfig(ownerId);
      if (!config) {
        await assertOwner(ownerId);
        if (version === baselineVersion) baseline = { ownerId, configId: null, rows: new Map() };
        return { presets: [], timing: {} };
      }
      await assertOwner(ownerId);
      const [messages, timings] = await Promise.all([
        client.from('aiboard_meow_messages').select(MESSAGE_COLUMNS)
          .eq('config_id', config.id).eq('is_audio', false).order('sort_order', { ascending: true }),
        client.from('aiboard_meow_timing').select(TIMING_COLUMNS)
          .eq('config_id', config.id).order('updated_at', { ascending: false }),
      ]);
      if (messages.error || timings.error) throw new Error('Could not load your preset messages.');
      await assertOwner(ownerId);
      const normalized = normalizeMeowConfiguration(messages.data ?? [], timings.data ?? []);
      if (version === baselineVersion) {
        const visibleIds = new Set(normalized.presets.map(preset => preset.id));
        baseline = {
          ownerId, configId: config.id,
          rows: new Map((messages.data ?? []).filter(row => visibleIds.has(row.id)).map(row => [row.id, { state: row.state, message: row.message }])),
        };
      }
      return normalized;
    },

    async add(ownerId, state, text) {
      if (!MEOW_STATES.includes(state)) throw new Error('Choose a valid cat state.');
      const message = validateMeowText(text);
      await assertOwner(ownerId);
      const config = await ensureConfig(ownerId);
      const intentKey = JSON.stringify([ownerId, config.id, state, message]);
      let intent = pendingAdds.get(intentKey);
      if (intent) {
        const recovered = await findIntendedInsert(ownerId, intent);
        if (recovered) { pendingAdds.delete(intentKey); return recovered; }
      } else {
        // Retain this UUID until a receipt is confirmed. A dropped response must
        // not turn a retry into a second row with the same user's message.
        intent = { id: globalThis.crypto.randomUUID(), configId: config.id, state, message };
        pendingAdds.set(intentKey, intent);
      }
      const last = await client.from('aiboard_meow_messages').select('sort_order')
        .eq('config_id', config.id).eq('state', state).order('sort_order', { ascending: false }).limit(1);
      if (last.error) throw new Error('Could not add your preset message.');
      const lastOrder = Number(last.data?.[0]?.sort_order);
      const sortOrder = Number.isInteger(lastOrder) && lastOrder >= 0 ? Math.min(lastOrder + 1, 2147483647) : 0;
      await assertOwner(ownerId);
      baselineVersion += 1;
      let result;
      try {
        result = await client.from('aiboard_meow_messages').insert({
          id: intent.id, config_id: config.id, state, message, is_audio: false, audio_name: null, sort_order: sortOrder,
        }).select(MESSAGE_COLUMNS).single();
      } catch {
        throw new Error('Could not confirm your new preset. Keep your text and retry.');
      }
      if (result.error || !result.data) {
        // A duplicate-key response can be an earlier uncertain insert succeeding.
        const recovered = await findIntendedInsert(ownerId, intent);
        if (recovered) { pendingAdds.delete(intentKey); return recovered; }
        throw new Error('Could not add your preset message. Keep your text and retry.');
      }
      await assertOwner(ownerId);
      const preset = mutationPreset(result.data, { id: intent.id, text: message, state });
      rememberRow(ownerId, config.id, result.data);
      pendingAdds.delete(intentKey);
      return preset;
    },

    async update(ownerId, id, text, expectedText) {
      if (!validId(id)) throw new Error('Choose a valid preset message.');
      const message = validateMeowText(text);
      await assertOwner(ownerId);
      const config = await findConfig(ownerId);
      if (!config) throw new Error('This preset no longer exists. Reload and try again.');
      const original = originalRow(ownerId, config.id, id, expectedText);
      await assertOwner(ownerId);
      baselineVersion += 1;
      const result = await client.from('aiboard_meow_messages').update({ message })
        .eq('id', id).eq('config_id', config.id).eq('is_audio', false)
        .eq('state', original.state).eq('message', original.message)
        .select(MESSAGE_COLUMNS).maybeSingle();
      if (result.error) throw new Error('Could not update this preset. Reload and try again.');
      if (!result.data) throw conflict();
      await assertOwner(ownerId);
      const preset = mutationPreset(result.data, { text: message, id, state: original.state });
      rememberRow(ownerId, config.id, result.data);
      return preset;
    },

    async remove(ownerId, id, expectedText) {
      if (!validId(id)) throw new Error('Choose a valid preset message.');
      await assertOwner(ownerId);
      const config = await findConfig(ownerId);
      if (!config) throw new Error('This preset no longer exists. Reload and try again.');
      const original = originalRow(ownerId, config.id, id, expectedText);
      await assertOwner(ownerId);
      baselineVersion += 1;
      const result = await client.from('aiboard_meow_messages').delete()
        .eq('id', id).eq('config_id', config.id).eq('is_audio', false)
        .eq('state', original.state).eq('message', original.message).select('id').maybeSingle();
      if (result.error) throw new Error('Could not remove this preset. Reload and try again.');
      if (result.data?.id !== id) throw conflict();
      await assertOwner(ownerId);
      if (baseline?.ownerId === ownerId && baseline.configId === config.id) baseline.rows.delete(id);
    },
  };
}
