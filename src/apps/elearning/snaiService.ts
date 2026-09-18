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

export function createElearningSNAIService(supabase: any, fetch: typeof globalThis.fetch = (...args) => globalThis.fetch(...args)) {
// Client-side transport layer only. This file must NEVER import
// @google/genai, construct a GoogleGenAI client, read
// VITE_GEMINI_API_KEY, or call generateContent directly — all of that
// now lives exclusively in the server-only Cloudflare Pages Function at
// functions/api/molar-chat.ts, which this file calls via an authenticated
// fetch('/api/molar-chat', ...). The Supabase access token is attached as
// an explicit Authorization bearer header (obtained fresh from
// supabase.auth.getSession() on every call, never cached/logged) — the
// server independently verifies its signature, never trusts a
// client-supplied user id. Public function signatures are preserved so
// src/aiExperience/elearningMolarAdapter.ts requires no change.




async function invokeMolarChatRaw(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) {
    throw new Error('No active session');
  }

  const res = await fetch('/api/molar-chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null) as Record<string, unknown> | null;

  if (!res.ok || !data?.ok) {
    throw new Error((data?.error as string | undefined) || `AI service request failed (${res.status})`);
  }

  return data;
}

async function invokeMolarChat(payload: Record<string, unknown>): Promise<string> {
  const data = await invokeMolarChatRaw(payload);
  return (data.text as string | undefined) ?? '';
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
// Architecturally SEPARATE from `chatWithMolarAI` above: called only
// AFTER a deterministic local intent router + deterministic own-video-
// analytics/social provider (see src/aiExperience/dataChat/) have
// already produced minimized, model-safe facts. The Pages Function this
// calls NEVER decides which video is latest/most-viewed, never computes
// view counts, never decides current-follow state or notification-read
// state, and never receives the full `aiContext` string
// `chatWithMolarAI` does (which includes the user's raw email — see
// App.tsx) — only the user's question, the approved intent name, and
// the already-computed facts.
//
// CRITICAL: unlike `chatWithMolarAI`, this function THROWS on failure
// (missing session, network error, non-2xx response, empty response)
// rather than swallowing it into a friendly fallback string — the caller
// needs to distinguish success from failure so it can render a
// deterministic facts-only fallback instead (see
// src/aiExperience/dataChat/utils/formatGroundedElearningFallback.ts)
// rather than ever falling through to the full legacy General Chat
// pipeline.
//
// The returned text is plain assistant text ONLY. It is never scanned
// for fenced ```json action blocks — this function has no path to
// `window.__MOLAR_ACTIONS__` or any mutation.
async function chatWithGroundedElearningFacts(
  question: string,
  intent: string,
  facts: unknown
): Promise<string> {
  return invokeMolarChat({ mode: 'grounded', question, intent, facts });
}

// ─────────────────────────────────────────────────────────────
// SEMANTIC CAPABILITY ROUTING — selection only, never data.
//
// Calls the Pages Function's "capability_route" mode: the message, a
// small set of {id, description} capability descriptors, a few recent
// model-safe conversation turns, and the previously-selected capability
// id (if any). Never sees a video/creator-update row.
//
// THROWS on any failure exactly like chatWithGroundedElearningFacts —
// the caller (see dataChat/semantic/matchElearningCapabilityLLM.ts)
// must fall back to the local keyword capability matcher on any throw.




async function routeElearningCapability(
  message: string,
  capabilities: CapabilityDescriptor[],
  recentContext: string[],
  previousCapability: string | null
): Promise<CapabilityRouteResult> {
  const data = await invokeMolarChatRaw({
    mode: 'capability_route',
    message,
    capabilities,
    recentContext,
    previousCapability,
  });

  const { route, capability, confidence, clarification } = data as unknown as CapabilityRouteResult;
  if (route !== 'grounded' && route !== 'general_chat' && route !== 'clarification') {
    throw new Error('Capability routing returned an unsupported route');
  }
  if (confidence !== 'high' && confidence !== 'low') {
    throw new Error('Capability routing returned an invalid confidence');
  }

  return { route, capability: route === 'grounded' ? capability : null, confidence, clarification: clarification ?? null };
}

return { chatWithMolarAI, chatWithGroundedElearningFacts, routeElearningCapability };
}
