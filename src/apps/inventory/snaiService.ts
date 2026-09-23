type ChatHistory = {
  role: "user" | "model";
  parts: { text: string }[];
};

import { createAuthorizedSnaiTransport } from '../../ai/internal/snaiTransport';

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

export function createInventorySNAIService(supabase: any, fetch: typeof globalThis.fetch = (...args) => globalThis.fetch(...args)) {
// Thin client transport only. The shared `snai-chat` Edge Function owns
// authentication verification, prompts, model calls and response validation.
// This host supplies only its authenticated Supabase client and authorized data.

const invokeMolarChatInventory = createAuthorizedSnaiTransport(supabase, 'inventory', fetch);



const chatWithGemini = async (
  history: ChatHistory[],
  message: string,
  inventoryContext: string,
  purchaseHistory?: string,
  activityLogs?: string,
  userContext?: string,
): Promise<string> => {
  const { text } = await invokeMolarChatInventory({
    mode: 'general',
    history,
    message,
    inventoryContext,
    purchaseHistory,
    activityLogs,
    userContext,
  });
  return text;
};

// ─────────────────────────────────────────────────────────────
// DATA-DRIVEN CHAT — grounded response phrasing ONLY.
//
// Architecturally SEPARATE from `chatWithGemini` above: this function is
// called only AFTER a deterministic local intent router + deterministic
// Inventory data provider have already produced minimized structured
// facts (see aiExperience/dataChat/). The server never decides which
// records are expired/low-stock/expiring-soon, never computes counts,
// never picks the intent, and never receives the full inventory/purchase-
// history/activity-log context `chatWithGemini` does — only the user's
// question, the approved intent name, and the already-computed facts.
//
// CRITICAL: unlike `chatWithGemini`, this function THROWS on failure
// (network error, empty response) rather than swallowing it into a
// friendly fallback string — the caller (App.tsx) needs to distinguish
// success from failure so it can render a deterministic
// facts-only fallback instead (see
// aiExperience/dataChat/utils/formatGroundedInventoryFallback.ts) rather
// than ever falling through to the full General Chat pipeline.
//
// The returned text is plain assistant text ONLY. It is never scanned
// for `<ACTION>` blocks and the system instruction explicitly forbids
// emitting any — this function has no path to `receiveStock`/
// `removeStock`/`moveItem` or any other mutation, even if the model
// unexpectedly tried to emit one.
const chatWithGroundedInventoryFacts = async (
  question: string,
  intent: string,
  facts: unknown,
): Promise<string> => {
  const { text } = await invokeMolarChatInventory({ mode: 'grounded', question, intent, facts });
  return text;
};

// ─────────────────────────────────────────────────────────────
// SEMANTIC CAPABILITY ROUTING — selection only, never data.
//
// Calls the Edge Function's "capability_route" mode: the message, a
// small set of {id, description} capability descriptors, a few recent
// model-safe conversation turns, and the previously-selected capability
// id (if any). The Edge Function NEVER sees an inventory row and
// returns structured JSON, already validated server-side against the
// supplied capability id allowlist.
//
// THROWS on any failure exactly like chatWithGroundedInventoryFacts —
// the caller (see dataChat/semantic/matchInventoryCapabilityLLM.ts)
// must fall back to the local keyword capability matcher on any throw.




const routeInventoryCapability = async (
  message: string,
  capabilities: CapabilityDescriptor[],
  recentContext: string[],
  previousCapability: string | null,
): Promise<CapabilityRouteResult> => {
  const data = await invokeMolarChatInventory({
    mode: 'capability_route',
    message,
    capabilities,
    recentContext,
    previousCapability,
  });

  const { route, capability, confidence, clarification } = data as CapabilityRouteResult;
  if (route !== 'grounded' && route !== 'general_chat' && route !== 'clarification') {
    throw new Error('Capability routing returned an unsupported route');
  }
  if (confidence !== 'high' && confidence !== 'low') {
    throw new Error('Capability routing returned an invalid confidence');
  }

  return { route, capability: route === 'grounded' ? capability : null, confidence, clarification: clarification ?? null };
};

const extractInventoryDataFromImage = async (base64Image: string, mimeType: string): Promise<any[]> => {
  const data = await invokeMolarChatInventory({ mode: 'ocr', base64Image, mimeType });
  return Array.isArray(data.items) ? data.items : [];
};

return { chatWithGemini, chatWithGroundedInventoryFacts, routeInventoryCapability, extractInventoryDataFromImage };
}
