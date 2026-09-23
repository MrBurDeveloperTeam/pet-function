type ChatPart = { text: string };

import { createAuthorizedSnaiTransport } from '../../ai/internal/snaiTransport';

type ChatMessage = { role: 'user' | 'model'; parts: ChatPart[] };

interface CapabilityRouteResult {
  route: 'grounded' | 'general_chat' | 'clarification' | 'analytical_followup';
  capability: string | null;
  confidence: 'high' | 'low';
  clarification: string | null;
}

interface CapabilityDescriptor {
  id: string;
  description: string;
}

export function createTodoSNAIService(supabase: any, fetch: typeof globalThis.fetch = (...args) => globalThis.fetch(...args)) {
// Thin client transport only. The shared `snai-chat` Edge Function owns
// authentication verification, prompts, model calls and response validation.
// This host supplies only its authenticated Supabase client and authorized data.




const invokeSnai = createAuthorizedSnaiTransport(supabase, 'todo', fetch);

async function invokeMolarChat(payload: Record<string, unknown>): Promise<string> {
  const data = await invokeSnai(payload);
  return data.text;
}

async function chatWithMolarAI(
  history: ChatMessage[],
  message: string,
  userContext = ''
) {
  return invokeMolarChat({ mode: 'general', history, message, userContext });
}

// ─────────────────────────────────────────────────────────────
// DATA-DRIVEN CHAT — grounded response phrasing ONLY.
//
// Architecturally SEPARATE from `chatWithMolarAI` above: this function is
// called only AFTER a deterministic local intent router + deterministic
// task-state provider have already produced minimized, model-safe facts
// (see src/aiExperience/dataChat/). The Edge Function this calls NEVER
// decides which tasks are overdue/high-priority/due today, never computes
// counts, never picks the intent, and never receives the full `aiContext`
// string `chatWithMolarAI` does (which includes user name/email and raw
// upcoming task titles) — only the user's question, the approved intent
// name, and the already-computed, title-free facts.
//
// CRITICAL: unlike `chatWithMolarAI`, this function THROWS on failure
// (missing/invalid request, network error, empty response) rather than
// swallowing it into a friendly fallback string — the caller needs to
// distinguish success from failure so it can render a deterministic
// facts-only fallback instead (see
// src/aiExperience/dataChat/utils/formatGroundedTodoFallback.ts) rather
// than ever falling through to the full General Chat pipeline.
async function chatWithGroundedTodoFacts(
  question: string,
  intent: string,
  facts: unknown
): Promise<string> {
  return invokeMolarChat({ mode: 'grounded', question, intent, facts });
}

// ─────────────────────────────────────────────────────────────
// SEMANTIC CAPABILITY ROUTING — selection only, never data.
//
// Calls the Edge Function's "capability_route" mode: the message, a
// small set of {id, description} capability descriptors, a few recent
// model-safe conversation turns, and the previously-selected capability
// id (if any). The Edge Function NEVER sees a task row and returns
// structured JSON, already validated server-side against the supplied
// capability id allowlist — this function does NOT re-parse prose, it
// only forwards `data` through after Supabase's own JSON parsing.
//
// THROWS on any failure (network error, invalid response shape) exactly
// like chatWithGroundedTodoFacts — the caller (see
// dataChat/semantic/matchTodoCapabilityLLM.ts) must fall back to the
// local keyword capability matcher on any throw, never treat a routing
// failure as "no grounded capability applies."




async function routeTodoCapability(
  message: string,
  capabilities: CapabilityDescriptor[],
  recentContext: string[],
  previousCapability: string | null
): Promise<CapabilityRouteResult> {
  const data = await invokeSnai({ mode: 'capability_route', message, capabilities, recentContext, previousCapability });

  const { route, capability, confidence, clarification } = data as CapabilityRouteResult;
  if (route !== 'grounded' && route !== 'general_chat' && route !== 'clarification' && route !== 'analytical_followup') {
    throw new Error('Capability routing returned an unsupported route');
  }
  if (confidence !== 'high' && confidence !== 'low') {
    throw new Error('Capability routing returned an invalid confidence');
  }

  return {
    route,
    capability: route === 'grounded' || route === 'analytical_followup' ? capability : null,
    confidence,
    clarification: clarification ?? null,
  };
}

return { chatWithMolarAI, chatWithGroundedTodoFacts, routeTodoCapability };
}
