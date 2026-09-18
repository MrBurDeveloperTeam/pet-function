type ChatPart = { text: string };

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
void fetch;
// Client-side transport layer only. This file must NEVER import
// @google/genai, construct a GoogleGenAI client, read
// VITE_GEMINI_API_KEY, or call generateContent directly — all of that
// now lives exclusively in the server-only Supabase Edge Function at
// supabase/functions/molar-chat-calculator/index.ts, which this file
// calls via supabase.functions.invoke(). That invocation automatically
// carries the browser's current authenticated Supabase session as the
// Authorization bearer token — no token is ever placed into the request
// body/prompt here. Public function signatures are preserved so
// aiExperience/profitCalculatorMolarAdapter.ts requires no change.
//
// Namespaced as "molar-chat-calculator", NOT the generic "molar-chat"
// slug — this shared Supabase project also hosts separate,
// differently-prompted molar-chat functions for Appointment, Todo, and
// App Gallery; a shared name let one app's deploy silently overwrite
// another's system prompt (confirmed to have actually happened to this
// app).




async function invokeMolarChat(payload: Record<string, unknown>): Promise<string> {
  const { data, error } = await supabase.functions.invoke('molar-chat-calculator', {
    body: payload,
  });

  if (error || !data?.ok) {
    throw new Error(data?.error || error?.message || 'AI service request failed');
  }

  return data.text;
}

async function chatWithMolarAI(
  history: ChatMessage[],
  message: string,
  userContext = ''
) {
  try {
    return await invokeMolarChat({ mode: 'general', history, message, userContext });
  } catch (error) {
    console.error('Gemini Chat Error:', error);
    return "I'm having trouble connecting to the Snabbb Assistant Intelligent servers right now. Please try again shortly.";
  }
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
  const { data, error } = await supabase.functions.invoke('molar-chat-calculator', {
    body: { mode: 'capability_route', message, capabilities, recentContext, previousCapability },
  });

  if (error || !data?.ok) {
    throw new Error(data?.error || error?.message || 'Capability routing failed');
  }

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
