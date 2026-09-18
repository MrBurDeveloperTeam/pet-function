// PHASE 6D (Molar AI migration): the LOCAL orchestration adapter connecting
// the shared `@mrburdeveloperteam/pet-function/ai` chat UI runtime to
// E-Learning's own General Chat + Data-Driven Chat pipelines. The shared
// package only ever calls `sendMessage` and renders the returned
// `AIResponse.text` — every business decision below (mutation guard,
// deterministic intent classification, scope guards, grounded facts
// resolution, deterministic fallback, AIBoard keyword lookup, Gemini calls)
// is moved mechanically from the pre-migration `MolarAIFloat.jsx`, in the
// exact same priority order, not redesigned.
//
// Known cases are always returned as a normal `AIResponse` (never thrown) so
// their specific wording reaches the user — only a genuinely unexpected
// failure (e.g. a network error from the AIBoard keyword-lookup queries)
// propagates as a thrown error, which `SharedMolarAI`'s own outer catch
// turns into the identical generic "SNAI Error: Unable to process request."
// text the pre-migration component's own outer catch produced.
//
// `window.__MOLAR_ACTIONS__` fenced-json action-block parsing from the
// pre-migration `MolarAIFloat.jsx` is NOT ported here — a fresh repo-wide
// audit (see Phase 6D report) confirmed zero producer ever assigns
// `window.__MOLAR_ACTIONS__` anywhere in this repo, and its only defined
// actions were navigation-only (OPEN_LESSON/OPEN_CATEGORY/OPEN_SEARCH), so
// it was dead code, safely removed rather than ported.
import type { AIAdapter, AIMessage, AIRequest, AIResponse } from '../../contracts';
import type { PetDatabaseClient } from '../databaseClient';
import type { ElearningChatServices } from './transport';
import { isElearningMutationRequest } from './dataChat/router/isElearningMutationRequest';
import { classifyElearningDataIntent } from './dataChat/router/classifyElearningDataIntent';
import { resolveElearningDataQuery } from './dataChat/resolver/resolveElearningDataQuery';
import {
  buildUnsupportedParameterMessage,
  buildUnsupportedScopeMessage,
  buildUnsupportedSensitiveScopeMessage,
  buildUnavailableMessage,
} from './dataChat/utils/unsupportedParameterMessage';
import { formatGroundedElearningFallback } from './dataChat/utils/formatGroundedElearningFallback';
import { resolveElearningFollowUp } from './dataChat/router/resolveElearningFollowUp';
import { matchElearningCapability } from './dataChat/semantic/matchElearningCapability';
import { createElearningCapabilityMatcher } from './dataChat/semantic/matchElearningCapabilityLLM';
import type { ElearningDataChatSources } from './dataChat/dataChatSources';
import type { GroundedConversationContext } from './dataChat/context/groundedConversationContext';
import type { ElearningDataIntent } from './dataChat/contracts/groundedDataResult';

const CLARIFICATION_LABEL: Record<ElearningDataIntent, string> = {
  elearning_latest_video_performance: 'your latest video',
  elearning_most_viewed_video: 'your most viewed video',
  elearning_followed_creator_updates: 'new updates from creators you follow',
  elearning_general_video_list: 'a list of all your videos',
};

export interface CreateElearningMolarAdapterDeps extends ElearningChatServices {
  supabase: PetDatabaseClient;
  /** App.tsx's existing `aiContext` string (module/route/session/user/email
   *  summary) — built and owned entirely by the host, unchanged. */
  userContext: string;
  /** Phase-3 Data-Driven Chat sources, read from the existing React Query
   *  cache (see useElearningDataChatSources.ts) — unchanged. */
  dataChatSources: ElearningDataChatSources;
}

/** Maps SharedMolarAI's normalized `{role, text}` history into Gemini's
 *  native `{role, parts:[{text}]}` shape — kept entirely inside this
 *  adapter so the Gemini SDK's message shape never crosses the shared
 *  package boundary (the shared package must never see it). */
function toGeminiHistory(history: AIMessage[]) {
  return history.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
}

export function createElearningMolarAdapter(deps: CreateElearningMolarAdapterDeps): AIAdapter {
  const { supabase, chatWithMolarAI, chatWithGroundedElearningFacts, routeElearningCapability } = deps;
  const matchElearningCapabilityLLM = createElearningCapabilityMatcher(routeElearningCapability);
  // Grounded conversation context — lives only inside this closure (one
  // per authenticated user; see
  // dataChat/context/groundedConversationContext.ts's header).
  let groundedContext: GroundedConversationContext | null = null;

  // Shared by the fast-path classifier match AND the semantic capability
  // matcher below.
  async function executeGroundedIntent(intent: ElearningDataIntent, msg: string): Promise<AIResponse> {
    const result = resolveElearningDataQuery(intent, deps.dataChatSources);

    let dataChatResponseText: string;
    if (result.status === 'unavailable') {
      dataChatResponseText = buildUnavailableMessage(result.reasonCode);
    } else {
      try {
        dataChatResponseText = await chatWithGroundedElearningFacts(msg, result.intent, result.facts);
      } catch (groundedErr) {
        console.error('Grounded elearning response failed:', groundedErr);
        dataChatResponseText = formatGroundedElearningFallback(result.intent, result.facts);
      }
    }

    groundedContext = {
      appId: 'elearning',
      lastIntent: intent,
      presentedOrder: 'display',
      lastUserQuestion: msg,
      generation: (groundedContext?.generation ?? 0) + 1,
      createdAt: new Date().toISOString(),
    };

    return { text: dataChatResponseText };
  }

  return {
    reset() {
      groundedContext = null;
    },
    async sendMessage(request: AIRequest): Promise<AIResponse> {
      const msg = request.text.trim();

      // ── Phase-3 Data-Driven Chat (read-only) ──────────────────────────
      // Runs BEFORE the legacy General Chat pipeline below, and is fully
      // separate from it: a matched request here never calls the DB-backed
      // predefined-keyword lookup or `chatWithMolarAI`.

      // 1. Explicit mutation-shaped requests are intercepted with a
      // deterministic refusal — zero Gemini calls, zero mutation.
      if (isElearningMutationRequest(msg)) {
        return { text: "This data chat can check your video and creator-update information, but it can't make changes." };
      }

      // 2. Deterministic LOCAL intent classification (no Gemini call).
      const dataRoute = classifyElearningDataIntent(msg);

      if (dataRoute.kind === 'unsupported_sensitive_scope') {
        return { text: buildUnsupportedSensitiveScopeMessage(dataRoute.reason) };
      }

      if (dataRoute.kind === 'unsupported_parameter') {
        return { text: buildUnsupportedParameterMessage(dataRoute.reason) };
      }

      if (dataRoute.kind === 'unsupported_scope') {
        return { text: buildUnsupportedScopeMessage(dataRoute.reason) };
      }

      if (dataRoute.kind === 'matched') {
        return executeGroundedIntent(dataRoute.intent, msg);
      }

      // ── Tier C: Grounded conversational follow-up ────────────────────
      const followUp = resolveElearningFollowUp(msg, groundedContext, deps.dataChatSources);
      if (followUp && groundedContext) {
        groundedContext = { ...groundedContext, presentedOrder: followUp.presentedOrder, lastUserQuestion: msg, generation: groundedContext.generation + 1 };
        return { text: followUp.text };
      }

      // ── Tier D: Server-side LLM semantic capability router ────────────
      const recentUserContext = request.history
        .filter((m) => m.role === 'user')
        .slice(-3)
        .map((m) => m.text);
      const llmRoute = await matchElearningCapabilityLLM(msg, recentUserContext, groundedContext?.lastIntent ?? null);

      if (llmRoute.type === 'grounded_capability') {
        return executeGroundedIntent(llmRoute.capability, msg);
      }
      if (llmRoute.type === 'clarification') {
        return { text: llmRoute.text };
      }
      if (llmRoute.type !== 'general_chat') {
        // ── Tier E: Local keyword capability router (fallback) ──────────
        const semanticRoute = matchElearningCapability(msg);
        if (semanticRoute.type === 'grounded_capability') {
          return executeGroundedIntent(semanticRoute.capability, msg);
        }
        if (semanticRoute.type === 'clarification') {
          const [a, b] = semanticRoute.candidates;
          return { text: `Do you mean ${CLARIFICATION_LABEL[a]} or ${CLARIFICATION_LABEL[b]}?` };
        }
      }
      // ── End Phase-3 Data-Driven Chat (dataRoute.kind === 'no_match') ──

      let response: string | null = null;

      // 1. Check custom AIBoard keyword responses first.
      const { data: apps } = await supabase
        .from('aiboard_response_target_apps')
        .select('response_id')
        .in('app_name', ['E-learning', 'All']);

      if (apps && apps.length > 0) {
        const responseIds = apps.map((a: { response_id: string }) => a.response_id);
        const { data: keywords } = await supabase
          .from('aiboard_response_keywords')
          .select('keyword, response_id')
          .in('response_id', responseIds);

        if (keywords && keywords.length > 0) {
          const matchedKeyword = keywords.find((k: { keyword: string; response_id: string }) => msg.toLowerCase().includes(k.keyword.toLowerCase()));

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

      // 2. Fallback to Gemini.
      if (!response) {
        response = await chatWithMolarAI(toGeminiHistory(request.history), msg, deps.userContext);
      }

      return { text: response };
    },
  };
}
