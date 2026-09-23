import { createAuthorizedSnaiTransport } from '../../ai/internal/snaiTransport';

// SNAI client transport. Host supplies its current authenticated client; no secrets.
export function createAppointmentSNAIService(supabase, fetch = (...args) => globalThis.fetch(...args)) {
// Thin client transport only. The shared `snai-chat` Edge Function owns
// authentication verification, prompts, model calls and response validation.
// This host supplies only its authenticated Supabase client and authorized data.

const invokeMolarChatRaw = createAuthorizedSnaiTransport(supabase, 'appointment', fetch);

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
  return invokeMolarChat({ mode: 'general', history, message, userContext: userContext || '' });
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
