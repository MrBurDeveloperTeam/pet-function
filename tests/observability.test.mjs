import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('shared diagnostics expose the complete safe chat and pet lifecycle', () => {
  const diagnostics = read('src/observability/diagnostics.ts');
  for (const event of [
    'snai_chat_submitted', 'snai_chat_answered', 'snai_chat_failed', 'snai_fallback_used',
    'snai_request_started', 'snai_request_succeeded', 'snai_request_failed',
    'pet_dialogue_evaluated', 'pet_dialogue_selected', 'pet_dialogue_shown',
    'pet_dialogue_closed', 'pet_dialogue_action_clicked',
  ]) assert.match(diagnostics, new RegExp(event));
  assert.doesNotMatch(diagnostics, /prompt\??:|answer\??:|facts\??:|email\??:|token\??:/i);
  assert.match(diagnostics, /snabbb:diagnostic/);
});

test('shared chat renders typed errors and retry without the old generic error', () => {
  const chat = read('src/ai/SharedMolarAI.tsx');
  assert.match(chat, /getSnaiErrorUserMessage/);
  assert.match(chat, /snai_chat_failed/);
  assert.match(chat, /Try again/);
  assert.doesNotMatch(chat, /SNAI Error: Unable to process request/);
});

test('standard and superapp pet runtimes emit evaluation through action lifecycle events', () => {
  const standard = read('src/cat/runtime.ts');
  const superapp = read('src/apps/superapp/SuperappCatMascot.tsx');
  for (const source of [standard, superapp]) {
    for (const event of ['pet_dialogue_evaluated', 'pet_dialogue_selected', 'pet_dialogue_shown', 'pet_dialogue_closed', 'pet_dialogue_action_clicked']) {
      assert.match(source, new RegExp(event));
    }
  }
});

test('optional Supabase query cannot store prompts, replies, facts, or free-form metadata', () => {
  const sql = read('supabase/snai-observability.sql');
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /actor_id = auth\.uid\(\)/);
  assert.doesNotMatch(sql, /^\s*(prompt|answer|message|facts|metadata)\s+/im);
});
