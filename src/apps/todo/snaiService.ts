type ChatPart = { text: string };

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
void fetch;
// Client-side transport layer only. This file must NEVER import
// @google/genai, construct a GoogleGenAI client, read
// VITE_GEMINI_API_KEY, or call generateContent directly — all of that now
// lives exclusively in the server-only Supabase Edge Function at
// supabase/functions/molar-chat-todo/index.ts, which this file calls via
// supabase.functions.invoke(). That invocation automatically carries the
// browser's current authenticated Supabase session as the Authorization
// bearer token — no token is ever placed into the request body/prompt
// here. Public function signatures are preserved so
// src/aiExperience/todoMolarAdapter.ts requires no change.
//
// Namespaced as "molar-chat-todo", NOT the generic "molar-chat" slug —
// this shared Supabase project also hosts separate, differently-prompted
// molar-chat functions for Appointment, Calculator, and App Gallery; a
// shared name let one app's deploy silently overwrite another's system
// prompt (confirmed to have actually happened to this app).




async function invokeMolarChat(payload: Record<string, unknown>): Promise<string> {
  if (!supabase) {
    throw new Error('AI service is not configured');
  }

  const { data, error } = await supabase.functions.invoke('molar-chat-todo', {
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
  if (!supabase) {
    throw new Error('AI service is not configured');
  }

  const { data, error } = await supabase.functions.invoke('molar-chat-todo', {
    body: { mode: 'capability_route', message, capabilities, recentContext, previousCapability },
  });

  if (error || !data?.ok) {
    throw new Error(data?.error || error?.message || 'Capability routing failed');
  }

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
