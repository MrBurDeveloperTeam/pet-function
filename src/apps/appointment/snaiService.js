// SNAI client transport. Host supplies its current authenticated client; no secrets.
export function createAppointmentSNAIService(supabase, fetch = (...args) => globalThis.fetch(...args)) {
void fetch;
// Client-side transport layer only. This file must NEVER import
// @google/genai, construct a GoogleGenAI client, read
// VITE_GEMINI_API_KEY, or call generateContent directly — all of that now
// lives exclusively in the server-only Supabase Edge Function at
// supabase/functions/molar-chat-appointment/index.ts, which this file
// calls via supabase.functions.invoke(). That invocation automatically
// carries the browser's current authenticated Supabase session as the
// Authorization bearer token — no token is ever placed into the request
// body/prompt here. Public function signatures are preserved so
// src/aiExperience/appointmentsMolarAdapter.ts requires no change beyond
// the mutation-dispatch removal made alongside this migration.
//
// Namespaced as "molar-chat-appointment", NOT the generic "molar-chat"
// slug — this shared Supabase project also hosts separate,
// differently-prompted molar-chat functions for Todo, Calculator, and
// App Gallery; a shared name let one app's deploy silently overwrite
// another's system prompt (confirmed to have actually happened).

async function invokeMolarChatRaw(payload) {
  const { data, error } = await supabase.functions.invoke('molar-chat-appointment', {
    body: payload,
  });

  if (error || !data?.ok) {
    throw new Error(data?.error || error?.message || 'AI service request failed');
  }

  return data;
}

async function invokeMolarChat(payload) {
  const data = await invokeMolarChatRaw(payload);
  return data.text;
}

/**
 * Chat with Molar AI, optionally injecting user/appointment context.
 * @param {Array} history - [{role, parts:[{text}]}]
 * @param {string} message
 * @param {string} [userContext]
 */
async function chatWithMolarAI(history, message, userContext) {
  try {
    return await invokeMolarChat({ mode: 'general', history, message, userContext: userContext || '' });
  } catch (error) {
    console.error('Gemini Chat Error:', error);
    return "I'm having trouble connecting to the Snabbb Assistant Intelligent servers right now. Please try again shortly.";
  }
}

// ─────────────────────────────────────────────────────────────
// DATA-DRIVEN CHAT — grounded response phrasing ONLY.
//
// Architecturally SEPARATE from `chatWithMolarAI` above: called only
// AFTER a deterministic local intent router + deterministic appointment-
// state provider (see src/aiExperience/dataChat/) have already produced
// minimized, model-safe facts. The Edge Function this calls NEVER decides
// appointment eligibility, 2-hour-window membership, room occupancy, or
// counts, and never receives the full `aiContext` string `chatWithMolarAI`
// does (which embeds patient names/phones/emails and a resolved-patient-
// name schedule — see App.jsx's `aiContext`) — only the user's question,
// the approved intent name, and the already-computed, patient-free facts.
//
// CRITICAL: unlike `chatWithMolarAI`, this function THROWS on failure
// (invalid request, network error, empty response) rather than swallowing
// it into a friendly fallback string — the caller needs to distinguish
// success from failure so it can render a deterministic facts-only
// fallback instead (see
// src/aiExperience/dataChat/utils/formatGroundedAppointmentFallback.js)
// rather than ever falling through to the full legacy General Chat
// pipeline.
//
// The returned text is plain assistant text ONLY. It is never scanned for
// fenced ```json action blocks, and the system instruction explicitly
// forbids emitting any — this function has no path to any appointment
// mutation.
async function chatWithGroundedAppointmentFacts(question, intent, facts) {
  return invokeMolarChat({ mode: 'grounded', question, intent, facts });
}

// ─────────────────────────────────────────────────────────────
// SEMANTIC CAPABILITY ROUTING — selection only, never data.
//
// Calls the Edge Function's "capability_route" mode. The CALLER (see
// dataChat/semantic/matchAppointmentCapabilityLLM.ts) must only ever
// pass the 4 non-PII capabilities here — this transport layer does not
// itself restrict which capabilities are sent, that boundary lives in
// the caller and is re-validated both server- and client-side.
//
// THROWS on any failure exactly like chatWithGroundedAppointmentFacts.
async function routeAppointmentCapability(message, capabilities, recentContext, previousCapability) {
  const data = await invokeMolarChatRaw({
    mode: 'capability_route',
    message,
    capabilities,
    recentContext,
    previousCapability,
  });

  const { route, capability, confidence, clarification } = data;
  if (route !== 'grounded' && route !== 'general_chat' && route !== 'clarification') {
    throw new Error('Capability routing returned an unsupported route');
  }
  if (confidence !== 'high' && confidence !== 'low') {
    throw new Error('Capability routing returned an invalid confidence');
  }

  return { route, capability: route === 'grounded' ? capability : null, confidence, clarification: clarification ?? null };
}

return { chatWithMolarAI, chatWithGroundedAppointmentFacts, routeAppointmentCapability };
}

