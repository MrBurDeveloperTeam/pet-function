// PHASE 3C (Molar AI extraction): the shared Molar AI presentation +
// generic chat lifecycle now live in
// @mrburdeveloperteam/pet-function/ai's <SharedMolarAI>. This file is
// the LOCAL AI orchestration adapter — every piece of Content Studio
// business/data logic that lived inline in the old MolarAIFloat.jsx's
// handleSendMessage is UNCHANGED in content here, only relocated and
// wrapped as `AIAdapter.sendMessage({ text, history }) => Promise<{ text,
// meta }>`. The shared UI never sees any of: the mutation guard, the Data
// Chat classifier/resolver, the AIBoard keyword-response lookup, or the
// Gemini calls — it only ever receives the final resolved text.
//
// The one outer try/catch that used to wrap the whole send pipeline (to
// render the shared typed failure experience) is intentionally NOT
// reproduced here — SharedMolarAI itself catches any rejection from
// `adapter.sendMessage` and renders that exact same fallback text, so
// this function is free to simply throw/let errors propagate for that
// generic case. The one INNER try/catch that existed for a deliberate,
// non-generic fallback (grounded Gemini phrasing failing over to a
// deterministic formatted answer) is preserved exactly, since that is
// business behavior, not generic error UI.

import { isContentStudioMutationRequest } from './dataChat/router/isContentStudioMutationRequest';
import { classifyContentStudioDataIntent } from './dataChat/router/classifyContentStudioDataIntent';
import { resolveContentStudioDataQuery } from './dataChat/resolver/resolveContentStudioDataQuery';
import {
  buildUnsupportedParameterMessage,
  buildUnsupportedScopeMessage,
  buildUnavailableMessage,
} from './dataChat/utils/unsupportedParameterMessage';
import { formatGroundedContentStudioFallback } from './dataChat/utils/formatGroundedContentStudioFallback';
import { resolveContentStudioFollowUp } from './dataChat/router/resolveContentStudioFollowUp';
import { matchContentStudioCapability } from './dataChat/semantic/matchContentStudioCapability';
import { createContentStudioCapabilityMatcher } from './dataChat/semantic/matchContentStudioCapabilityLLM';

const CLARIFICATION_LABEL = {
  contentstudio_plan_status: 'your plan',
  contentstudio_recent_generation: 'your most recent generation',
  contentstudio_recent_generations_list: 'your recent generations',
};

/**
 * @param {import('./transport').ContentStudioChatServices & { supabase: import('../databaseClient').PetDatabaseClient, snapshot: import('./ContentStudioDataChatProvider').ContentStudioDataChatSnapshot, userId: string | null, userContext: string }} deps
 * @returns {{ sendMessage: (request: { text: string, history: { role: 'user'|'model', text: string }[] }) => Promise<{ text: string, meta?: { source: 'general'|'data-chat'|'fallback' } }> }}
 */
export function createContentStudioAIAdapter({ snapshot, userId, userContext, supabase, chatWithMolarAI, chatWithGroundedContentStudioFacts, routeContentStudioCapability }) {
  const matchContentStudioCapabilityLLM = createContentStudioCapabilityMatcher(routeContentStudioCapability);
  /** @type {import('./dataChat/context/groundedConversationContext').GroundedConversationContext | null} */
  let groundedContext = null;

  /** Shared by the fast-path classifier match AND the semantic
   *  capability matcher below.
   *  @param {import('./dataChat/contracts/groundedDataResult').ContentStudioDataIntent} intent
   *  @param {string} msg */
  async function executeGroundedIntent(intent, msg) {
    const result = resolveContentStudioDataQuery(intent, snapshot, userId);

    if (result.status === 'unavailable') {
      return { text: buildUnavailableMessage(result.reasonCode), meta: { source: 'fallback' } };
    }

    groundedContext = {
      appId: 'content-studio',
      lastIntent: result.intent,
      lastUserQuestion: msg,
      generation: (groundedContext?.generation ?? 0) + 1,
      createdAt: new Date().toISOString(),
    };

    try {
      const text = await chatWithGroundedContentStudioFacts(msg, result.intent, result.facts);
      return { text, meta: { source: 'data-chat' } };
    } catch (groundedErr) {
      console.error('Grounded content studio response failed:', groundedErr);
      return { text: formatGroundedContentStudioFallback(result.intent, result.facts), meta: { source: 'fallback' } };
    }
  }

  return {
    diagnosticContext: { appId: 'image-generator' },
    reset() {
      groundedContext = null;
    },
    sendMessage: async ({ text: msg, history }) => {
      // ── Phase-3 Data-Driven Chat (read-only pilot) ──────────────────
      // Runs BEFORE the legacy General Chat pipeline below, fully
      // separate from it — unchanged in content from the pre-extraction
      // implementation.

      // 1. Explicit mutation-shaped requests are intercepted with a
      // deterministic refusal — zero Gemini calls, zero mutation.
      if (isContentStudioMutationRequest(msg)) {
        return {
          text: "This data chat can check your plan and recent generation, but it can't make changes.",
          meta: { source: 'fallback' },
        };
      }

      // 2. Deterministic LOCAL intent classification (no Gemini call).
      const dataRoute = classifyContentStudioDataIntent(msg);

      if (dataRoute.kind === 'unsupported_parameter') {
        return { text: buildUnsupportedParameterMessage(dataRoute.reason), meta: { source: 'fallback' } };
      }

      if (dataRoute.kind === 'unsupported_scope') {
        return { text: buildUnsupportedScopeMessage(dataRoute.reason), meta: { source: 'fallback' } };
      }

      if (dataRoute.kind === 'matched') {
        return executeGroundedIntent(dataRoute.intent, msg);
      }

      // ── Tier C: Grounded conversational follow-up ────────────────────
      const followUp = resolveContentStudioFollowUp(msg, groundedContext, snapshot, userId);
      if (followUp && groundedContext) {
        groundedContext = { ...groundedContext, lastUserQuestion: msg, generation: groundedContext.generation + 1 };
        return { text: followUp, meta: { source: 'data-chat' } };
      }

      // ── Tier D: Server-side LLM semantic capability router ─────────────
      // General creative-assistant conversation ("give me content
      // ideas") is explicitly instructed server-side to route to
      // general_chat, preserving that flexible role.
      const recentUserContext = history
        .filter((m) => m.role === 'user')
        .slice(-3)
        .map((m) => m.text);
      const llmRoute = await matchContentStudioCapabilityLLM(msg, recentUserContext, groundedContext?.lastIntent ?? null);

      if (llmRoute.type === 'grounded_capability') {
        return executeGroundedIntent(llmRoute.capability, msg);
      }
      if (llmRoute.type === 'clarification') {
        return { text: llmRoute.text, meta: { source: 'fallback' } };
      }
      if (llmRoute.type !== 'general_chat') {
        // ── Tier E: Local keyword capability router (fallback) ──────────
        const semanticRoute = matchContentStudioCapability(msg);
        if (semanticRoute.type === 'grounded_capability') {
          return executeGroundedIntent(semanticRoute.capability, msg);
        }
        if (semanticRoute.type === 'clarification') {
          const [a, b] = semanticRoute.candidates;
          return { text: `Do you mean ${CLARIFICATION_LABEL[a]} or ${CLARIFICATION_LABEL[b]}?`, meta: { source: 'fallback' } };
        }
      }
      // ── End Phase-3 Data-Driven Chat (dataRoute.kind === 'no_match') ─

      // 1. Check custom AIBoard responses first
      const { data: apps } = await supabase
        .from('aiboard_response_target_apps')
        .select('response_id')
        .in('app_name', ['Content Studio', 'All']);

      let response = null;
      if (apps && apps.length > 0) {
        const responseIds = apps.map((a) => a.response_id);
        const { data: keywords } = await supabase
          .from('aiboard_response_keywords')
          .select('keyword, response_id')
          .in('response_id', responseIds);

        if (keywords && keywords.length > 0) {
          const matchedKeyword = keywords.find((k) => msg.toLowerCase().includes(k.keyword.toLowerCase()));

          if (matchedKeyword) {
            const { data: respData } = await supabase
              .from('aiboard_responses')
              .select('response')
              .eq('id', matchedKeyword.response_id)
              .single();

            if (respData) {
              response = respData.response;
            }
          }
        }
      }

      // 2. Fallback to Gemini — reconstruct the Gemini SDK's own
      // {role, parts:[{text}]} shape from the shared AIMessage[] history
      // (the shared package's canonical shape is {role, text}).
      if (!response) {
        const geminiHistory = history.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
        response = await chatWithMolarAI(geminiHistory, msg, userContext || '');
      }

      return { text: response, meta: { source: 'general' } };
    },
  };
}
