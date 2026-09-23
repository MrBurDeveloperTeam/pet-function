import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const SHARED_ENDPOINT = 'https://app.snabbb.com/api/snai/chat';

async function service(app, name) {
  const ext = ['appointment', 'image-generator'].includes(app) ? 'js' : 'ts';
  const entry = new URL('../src/apps/' + app + '/snaiService.' + ext, import.meta.url);
  const result = await build({ entryPoints: [entry.pathname.slice(1)], bundle: true, write: false, format: 'esm', platform: 'browser' });
  const code = result.outputFiles[0].text;
  return (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64')))[name];
}

function authenticatedClient(getToken = () => 'fresh-token') {
  return {
    auth: {
      getSession: async () => ({
        data: { session: getToken() ? { access_token: getToken() } : null },
        error: null,
      }),
    },
  };
}

function response(body, status = body?.ok === false ? 502 : 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => name.toLowerCase() === 'x-snai-request-id' ? body?.requestId ?? null : null },
    json: async () => body,
  };
}

for (const [app, name, general, grounded, route] of [
  ['inventory', 'Inventory', 'chatWithGemini', 'chatWithGroundedInventoryFacts', 'routeInventoryCapability'],
  ['calculator', 'Calculator', 'chatWithMolarAI', 'chatWithGroundedProfitFacts', 'routeCalculatorCapability'],
  ['todo', 'Todo', 'chatWithMolarAI', 'chatWithGroundedTodoFacts', 'routeTodoCapability'],
  ['appointment', 'Appointment', 'chatWithMolarAI', 'chatWithGroundedAppointmentFacts', 'routeAppointmentCapability'],
]) test(app + ' SNAI uses the central Worker with fresh auth, grounding, routing, and normalized failures', async () => {
  let reply = { ok: true, text: 'mock answer' };
  const calls = [];
  const mockFetch = async (url, options) => {
    calls.push({ url, ...options, body: JSON.parse(options.body) });
    return response(reply);
  };
  const api = (await service(app, 'create' + name + 'SNAIService'))(authenticatedClient(), mockFetch);

  assert.equal(await api[general]([], 'hello', 'context'), 'mock answer');
  assert.equal(calls.at(-1).url, SHARED_ENDPOINT);
  assert.equal(calls.at(-1).headers.Authorization, 'Bearer fresh-token');
  assert.equal(calls.at(-1).body.appId, app);
  assert.equal(calls.at(-1).body.mode, 'general');
  assert.equal(JSON.stringify(calls.at(-1).body).includes('fresh-token'), false);

  assert.equal(await api[grounded]('question', 'approved_intent', { count: 2 }), 'mock answer');
  assert.deepEqual(calls.at(-1).body, { appId: app, mode: 'grounded', question: 'question', intent: 'approved_intent', facts: { count: 2 } });

  reply = { ok: true, route: 'general_chat', capability: 'ignore', confidence: 'high' };
  assert.equal((await api[route]('q', [], [], null)).capability, null);
  reply = { ok: true, route: 'invalid', confidence: 'high' };
  await assert.rejects(api[route]('q', [], [], null), /unsupported route/);

  reply = { ok: false, error: 'mock failure' };
  await assert.rejects(api[grounded]('q', 'intent', {}), /mock failure/);
  await assert.rejects(api[general]([], 'hello', ''), /mock failure/);

  reply = { ok: false, requestId: 'req_12345678', error: { code: 'AI_RATE_LIMITED', userMessage: 'rate limited', retryable: true, requestId: 'req_12345678' } };
  await assert.rejects(api[general]([], 'hello', ''), error => error.code === 'AI_RATE_LIMITED' && error.retryable === true && error.requestId === 'req_12345678');
});

test('Elearning obtains a fresh session per request and never sends a token in the body', async () => {
  let token = 'first';
  const calls = [];
  const mockFetch = async (url, options) => {
    calls.push({ url, ...options });
    return response({ ok: true, text: 'mock' });
  };
  const api = (await service('elearning', 'createElearningSNAIService'))(authenticatedClient(() => token), mockFetch);
  await api.chatWithGroundedElearningFacts('q', 'intent', {});
  token = 'second';
  await api.chatWithGroundedElearningFacts('q', 'intent', {});
  assert.equal(calls[0].headers.Authorization, 'Bearer first');
  assert.equal(calls[1].headers.Authorization, 'Bearer second');
  assert.equal(calls[0].url, SHARED_ENDPOINT);
  assert.doesNotMatch(calls[0].body, /first|access_token/);
  token = null;
  await assert.rejects(api.chatWithGroundedElearningFacts('q', 'intent', {}), error => error.code === 'AUTH_REQUIRED');
  assert.equal(calls.length, 2);
});

test('Content Studio uses the central authenticated Worker', async () => {
  const calls = [];
  let ok = true;
  const mockFetch = async (url, options) => {
    calls.push({ url, ...options, body: JSON.parse(options.body) });
    return response(ok ? { ok: true, text: 'mock' } : { ok: false, error: 'mock failure' });
  };
  const api = (await service('image-generator', 'createContentStudioSNAIService'))(authenticatedClient(), mockFetch);
  assert.equal(await api.chatWithGroundedContentStudioFacts('q', 'intent', {}), 'mock');
  assert.equal(calls[0].url, SHARED_ENDPOINT);
  assert.equal(calls[0].body.appId, 'image-generator');
  ok = false;
  await assert.rejects(api.chatWithGroundedContentStudioFacts('q', 'intent', {}), /mock failure/);
});

test('Superapp preserves its General Chat-only payload on the central Worker', async () => {
  let call;
  const mockFetch = async (url, options) => {
    call = { url, ...options, body: JSON.parse(options.body) };
    return response({ ok: true, text: 'mock' });
  };
  const api = (await service('superapp', 'createSuperappSNAIService'))(authenticatedClient(), mockFetch);
  await api.chatWithGemini([], 'q', 'ignored inventory', 'ignored purchases', 'ignored logs', 'safe user');
  assert.equal(call.url, SHARED_ENDPOINT);
  assert.deepEqual(call.body, { appId: 'superapp', mode: 'general', history: [], message: 'q', userContext: 'safe user' });
});

test('Shared transport has one central endpoint and no Edge Function invocation', () => {
  const source = readFileSync(new URL('../src/ai/internal/snaiTransport.ts', import.meta.url), 'utf8');
  assert.match(source, /https:\/\/app\.snabbb\.com\/api\/snai\/chat/);
  assert.match(source, /supabase\.auth\.getSession\(\)/);
  assert.match(source, /Authorization:\s*`Bearer \$\{accessToken\}`/);
  assert.doesNotMatch(source, /supabase\.functions\.invoke|molar-chat-/);
});
