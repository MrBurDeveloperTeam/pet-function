type ChatPart = { text: string };

import { createAuthorizedSnaiTransport } from '../../ai/internal/snaiTransport';

type ChatMessage = { role: 'user' | 'model'; parts: ChatPart[] };

interface CapabilityRouteResult {
  route: 'grounded' | 'general_chat' | 'clarification';
  capability: string | null;
  confidence: 'high' | 'low';
  clarification: string | null;
}

interface CapabilityDescriptor {
  id: string;
  description: string;
}

export function createCalculatorSNAIService(supabase: any, fetch: typeof globalThis.fetch = (...args) => globalThis.fetch(...args)) {
// Thin client transport only. The shared `snai-chat` Edge Function owns
// authentication verification, prompts, model calls and response validation.
// This host supplies only its authenticated Supabase client and authorized data.




const invokeSnai = createAuthorizedSnaiTransport(supabase, 'calculator', fetch);

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
// integrity gate + the EXISTING authoritative `getGlobalTotalMonthlyCost()`
// (see aiExperience/dataChat/) have already produced a minimized,
// model-safe facts object. The Edge Function this calls NEVER queries
// calculator tables, never selects a saved plan, never chooses intent,
// and never recomputes cost/ROI — it only performs language generation
// over facts the client already resolved deterministically. It also
// never receives the full `aiContext` string `chatWithMolarAI` does —
// only the user's question, the approved intent name, and the
// already-computed facts.
//
// CRITICAL: unlike `chatWithMolarAI`, this function THROWS on failure
// (missing/invalid request, network error, empty response) rather than
// swallowing it into a friendly fallback string — the caller needs to
// distinguish success from failure so it can render a deterministic
// facts-only fallback instead (see
// aiExperience/dataChat/utils/formatGroundedProfitFallback.ts) rather
// than ever falling through to the full General Chat pipeline.
async function chatWithGroundedProfitFacts(
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
// small set of {id, description} capability descriptors (only the 2
// genuinely supported ones — live profit/margin/break-even are never
// offered), a few recent model-safe conversation turns, and the
// previously-selected capability id (if any). Never sees calculator
// state.
//
// THROWS on any failure exactly like chatWithGroundedProfitFacts — the
// caller (see dataChat/semantic/matchCalculatorCapabilityLLM.ts) must
// fall back to the local keyword capability matcher on any throw.




async function routeCalculatorCapability(
  message: string,
  capabilities: CapabilityDescriptor[],
  recentContext: string[],
  previousCapability: string | null
): Promise<CapabilityRouteResult> {
  const data = await invokeSnai({ mode: 'capability_route', message, capabilities, recentContext, previousCapability });

  const { route, capability, confidence, clarification } = data as CapabilityRouteResult;
  if (route !== 'grounded' && route !== 'general_chat' && route !== 'clarification') {
    throw new Error('Capability routing returned an unsupported route');
  }
  if (confidence !== 'high' && confidence !== 'low') {
    throw new Error('Capability routing returned an invalid confidence');
  }

  return { route, capability: route === 'grounded' ? capability : null, confidence, clarification: clarification ?? null };
}

return { chatWithMolarAI, chatWithGroundedProfitFacts, routeCalculatorCapability };
}
