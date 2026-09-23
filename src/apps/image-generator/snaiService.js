import { createAuthorizedSnaiTransport } from '../../ai/internal/snaiTransport';

// SNAI client transport. Host supplies its current authenticated client; no secrets.
export function createContentStudioSNAIService(supabase, fetch = (...args) => globalThis.fetch(...args)) {
// Thin client transport only. The shared `snai-chat` Edge Function owns
// authentication verification, prompts, model calls and response validation.
// This host supplies only its authenticated Supabase client and authorized data.

const postMolarChatRaw = createAuthorizedSnaiTransport(supabase, 'image-generator', fetch);

async function postMolarChat(payload) {
  const data = await postMolarChatRaw(payload);
  return data.text;
}

/**
 * Chat with Molar AI, optionally injecting user/appointment context.
 * @param {Array} history - [{role, parts:[{text}]}]
 * @param {string} message
 * @param {string} [userContext]
 */
async function chatWithMolarAI(history, message, userContext) {
  return postMolarChat({ mode: 'general', history, message, userContext: userContext || '' });
}

// ─────────────────────────────────────────────────────────────
// DATA-DRIVEN CHAT — grounded response phrasing ONLY.
//
// Architecturally SEPARATE from `chatWithMolarAI` above: called only
// AFTER a deterministic local intent router + deterministic ownership/
// readiness gate + a pure provider (see src/aiExperience/dataChat/)
// have already produced minimized, model-safe facts. The server route
// here NEVER decides plan status, generation status, or "latest" — it
// only phrases the already-computed facts this function passes it. It
// also never receives the static legacy `userContext` string
// `chatWithMolarAI` does, and never receives a raw prompt, output URL,
// email, or auth/ownership ID.
//
// CRITICAL: unlike `chatWithMolarAI`, this function THROWS on failure
// (missing/invalid request, network error, empty response) rather than
// swallowing it into a friendly fallback string — the caller needs to
// distinguish success from failure so it can render a deterministic
// facts-only fallback instead (see
// src/aiExperience/dataChat/utils/formatGroundedContentStudioFallback.ts)
// rather than ever falling through to the full legacy General Chat
// pipeline.
async function chatWithGroundedContentStudioFacts(question, intent, facts) {
  return postMolarChat({ mode: 'grounded', question, intent, facts });
}

// ─────────────────────────────────────────────────────────────
// SEMANTIC CAPABILITY ROUTING — selection only, never data.
//
// Calls the server route's "capability_route" mode: the message, a
// small set of {id, description} capability descriptors, a few recent
// model-safe conversation turns, and the previously-selected capability
// id (if any). Never sees plan/generation state.
//
// THROWS on any failure exactly like chatWithGroundedContentStudioFacts
// — the caller (see dataChat/semantic/matchContentStudioCapabilityLLM.ts)
// must fall back to the local keyword capability matcher on any throw.
async function routeContentStudioCapability(message, capabilities, recentContext, previousCapability) {
  const data = await postMolarChatRaw({
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

return { chatWithMolarAI, chatWithGroundedContentStudioFacts, routeContentStudioCapability };
}
