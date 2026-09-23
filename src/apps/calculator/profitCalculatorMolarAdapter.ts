// PHASE 4D (Molar AI extraction): the shared Molar AI presentation +
// generic chat lifecycle now live in
// @mrburdeveloperteam/pet-function/ai's <SharedMolarAI>. This file is
// the LOCAL AI orchestration adapter — every piece of Profit Calculator
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
//
// The dead `window.__MOLAR_ACTIONS__` fenced-JSON action-block parser
// that used to wrap the General Chat response is NOT ported — confirmed
// via a fresh repo-wide grep (Phase 4D step 10) that zero assignment to
// `window.__MOLAR_ACTIONS__` exists anywhere in this repo (only this
// dead consumer + doc-comment references), so removing it loses no live
// behavior.

import { isProfitMutationRequest } from './dataChat/router/isProfitMutationRequest';
import { classifyProfitDataIntent } from './dataChat/router/classifyProfitDataIntent';
import { resolveProfitDataQuery } from './dataChat/resolver/resolveProfitDataQuery';
import {
  buildUnsupportedParameterMessage,
  buildUnsupportedScopeMessage,
} from './dataChat/utils/unsupportedParameterMessage';
import { formatGroundedProfitFallback } from './dataChat/utils/formatGroundedProfitFallback';
import { resolveProfitFollowUp } from './dataChat/router/resolveProfitFollowUp';
import { matchCalculatorCapability } from './dataChat/semantic/matchCalculatorCapability';
import { createCalculatorCapabilityMatcher } from './dataChat/semantic/matchCalculatorCapabilityLLM';
import type { GroundedContextStore } from './dataChat/context/groundedConversationContext';
import type { ProfitDataIntent } from './dataChat/contracts/groundedDataResult';
import type { CalculatorChatServices } from './transport';
import type { PetDatabaseClient } from '../databaseClient';
import type { CalculatorDataStatus, GlobalState, SavedPlan } from './types';

const CLARIFICATION_LABEL: Record<ProfitDataIntent, string> = {
  profit_cost_summary: 'your current monthly cost configuration',
  profit_latest_saved_plan: 'your latest saved plan',
};

export interface CreateProfitCalculatorMolarAdapterDeps extends CalculatorChatServices {
  supabase: PetDatabaseClient;
  calculatorState: GlobalState;
  getGlobalTotalMonthlyCost: (state?: GlobalState) => number;
  calculatorDataStatus: CalculatorDataStatus;
  calculatorDataUserId: string | null;
  userId: string | null;
  userContext: string;
  savedPlans: SavedPlan[];
  /** Host-owned (MolarAIFloat.jsx `useRef`) store — keeps the grounded
   *  follow-up context alive across adapter recreation (see
   *  dataChat/context/groundedConversationContext.ts's own doc). Cleared
   *  by the identity-keyed remount boundary on MolarAIFloat and by this
   *  adapter's `reset()`. */
  groundedContextStore: GroundedContextStore;
}

export function createProfitCalculatorMolarAdapter({
  calculatorState,
  getGlobalTotalMonthlyCost,
  calculatorDataStatus,
  calculatorDataUserId,
  userId,
  userContext,
  savedPlans,
  groundedContextStore,
  supabase,
  chatWithMolarAI,
  chatWithGroundedProfitFacts,
  routeCalculatorCapability,
}: CreateProfitCalculatorMolarAdapterDeps) {
  const matchCalculatorCapabilityLLM = createCalculatorCapabilityMatcher(routeCalculatorCapability);

  // Shared by the fast-path classifier match AND the semantic capability
  // matcher below.
  async function executeGroundedIntent(intent: ProfitDataIntent, msg: string) {
    const result = resolveProfitDataQuery(
      intent,
      calculatorState,
      getGlobalTotalMonthlyCost,
      calculatorDataStatus,
      calculatorDataUserId,
      userId,
      savedPlans
    );

    if (result.status === 'unavailable') {
      return { text: "Your calculator data isn't ready yet.", meta: { source: 'fallback' as const } };
    }

    groundedContextStore.set({
      appId: 'calculator',
      lastIntent: result.intent,
      lastUserQuestion: msg,
      generation: (groundedContextStore.get()?.generation ?? 0) + 1,
      createdAt: new Date().toISOString(),
    });

    try {
      const text = await chatWithGroundedProfitFacts(msg, result.intent, result.facts);
      return { text, meta: { source: 'data-chat' as const } };
    } catch (groundedErr) {
      console.error('Grounded profit response failed:', groundedErr);
      return { text: formatGroundedProfitFallback(result.intent, result.facts), meta: { source: 'fallback' as const } };
    }
  }

  return {
    diagnosticContext: { appId: 'calculator' },
    reset: () => {
      groundedContextStore.clear();
    },
    sendMessage: async ({ text: msg, history }: { text: string; history: { role: 'user' | 'model'; text: string }[] }) => {
      // ── Phase-3 Data-Driven Chat (read-only pilot) ──────────────────
      // Runs BEFORE the legacy General Chat pipeline below, fully
      // separate from it — unchanged in content from the pre-extraction
      // implementation.

      // 1. Explicit mutation-shaped requests are intercepted with a
      // deterministic refusal — zero Gemini calls, zero mutation.
      if (isProfitMutationRequest(msg)) {
        return {
          text: "This data chat can check your calculator's current cost configuration, but it can't make changes.",
          meta: { source: 'fallback' as const },
        };
      }

      // 2. Deterministic LOCAL intent classification (no Gemini call).
      const dataRoute = classifyProfitDataIntent(msg);

      if (dataRoute.kind === 'unsupported_parameter') {
        return { text: buildUnsupportedParameterMessage(dataRoute.reason), meta: { source: 'fallback' as const } };
      }

      if (dataRoute.kind === 'unsupported_scope') {
        return { text: buildUnsupportedScopeMessage(dataRoute.reason), meta: { source: 'fallback' as const } };
      }

      if (dataRoute.kind === 'matched') {
        return executeGroundedIntent(dataRoute.intent, msg);
      }

      // ── Tier C: Grounded conversational follow-up ───────────────────
      const groundedContext = groundedContextStore.get();
      const followUp = resolveProfitFollowUp(
        msg,
        groundedContext,
        calculatorState,
        getGlobalTotalMonthlyCost,
        calculatorDataStatus,
        calculatorDataUserId,
        userId,
        savedPlans
      );
      if (followUp && groundedContext) {
        groundedContextStore.set({ ...groundedContext, lastUserQuestion: msg, generation: groundedContext.generation + 1 });
        return { text: followUp, meta: { source: 'data-chat' as const } };
      }

      // ── Tier D: Server-side LLM semantic capability router ───────────
      const recentUserContext = history
        .filter((m) => m.role === 'user')
        .slice(-3)
        .map((m) => m.text);
      const llmRoute = await matchCalculatorCapabilityLLM(msg, recentUserContext, groundedContext?.lastIntent ?? null);

      if (llmRoute.type === 'grounded_capability') {
        return executeGroundedIntent(llmRoute.capability, msg);
      }
      if (llmRoute.type === 'clarification') {
        return { text: llmRoute.text, meta: { source: 'fallback' as const } };
      }
      if (llmRoute.type !== 'general_chat') {
        // ── Tier E: Local keyword capability router (fallback) ────────
        const semanticRoute = matchCalculatorCapability(msg);
        if (semanticRoute.type === 'grounded_capability') {
          return executeGroundedIntent(semanticRoute.capability, msg);
        }
        if (semanticRoute.type === 'clarification') {
          const [a, b] = semanticRoute.candidates;
          return { text: `Do you mean ${CLARIFICATION_LABEL[a]} or ${CLARIFICATION_LABEL[b]}?`, meta: { source: 'fallback' as const } };
        }
      }
      // ── End Phase-3 Data-Driven Chat (dataRoute.kind === 'no_match') ─

      // 1. Check custom AIBoard responses first
      const { data: apps } = await supabase
        .from('aiboard_response_target_apps')
        .select('response_id')
        .in('app_name', ['Profit Calculator', 'All']);

      let response: string | null = null;
      if (apps && apps.length > 0) {
        const responseIds = apps.map((a: { response_id: string }) => a.response_id);
        const { data: keywords } = await supabase
          .from('aiboard_response_keywords')
          .select('keyword, response_id')
          .in('response_id', responseIds);

        if (keywords && keywords.length > 0) {
          const matchedKeyword = keywords.find((k: { keyword: string }) => msg.toLowerCase().includes(k.keyword.toLowerCase()));

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

      return { text: response, meta: { source: 'general' as const } };
    },
  };
}
