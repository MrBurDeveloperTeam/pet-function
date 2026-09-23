// PHASE 9C (Molar AI migration): thin host `AIAdapter` implementation for
// `@mrburdeveloperteam/pet-function/ai`'s `<SharedMolarAI>`.
//
// This file is a MECHANICAL relocation of App.tsx's pre-9C `handleSendMessage`
// body — every branch, message string, and query is preserved verbatim.
// Nothing here is a redesign.
//
// FRESH ACTION-SURFACE AUDIT (this phase): a repo-wide search for
// window.__MOLAR_ACTIONS__, `<ACTION>` tags, fenced ```json action blocks,
// and any postMessage-based AI mutation bridge found ZERO matches anywhere
// in App Gallery. The Gemini system prompt (services/geminiService.ts)
// explicitly restricts the model to answering only "what is App.Snabbb" /
// "what does each app do" questions and instructs it never to execute
// actions. App Gallery has NO Data Chat pipeline either (no intent
// classifier, no resolver, no grounded-facts provider) — General Chat only.
// This adapter therefore has no action parser/dispatcher to relocate.
import type { AIAdapter, AIMessage } from '../../contracts';
import { getSuperappHostDependencies } from './dependencies';
type ChatHistory = { role: 'user' | 'model'; parts: { text: string }[] };

// Maps the shared package's normalized `{role, text}` history entries back
// to the `{role, parts:[{text}]}` shape `chatWithGemini` expects — this
// mapping stays local to the adapter, never leaking a Gemini-shaped type
// into the shared package (see AIRequest/AIMessage in
// @mrburdeveloperteam/pet-function/contracts).
function toGeminiHistory(history: AIMessage[]): ChatHistory[] {
  return history.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
}

// ROOT CAUSE (APP-GALLERY-AUTH-REFRESH-LOOP-AND-MOLAR-AI-RUNTIME-FIX):
// the AIBoard keyword lookup below previously matched via plain
// `message.includes(keyword)` — a raw substring check, not a whole-word
// match. The `aiboard_response_keywords` table has "hi" mapped to the
// canned response "Hello! How can I assist you today?" (a legitimate
// short greeting synonym on its own), but `.includes("hi")` also matches
// ANY message merely containing that substring inside an unrelated
// word — including "which" (w-HI-ch). Every one of "Which app should I
// use for stock?" / "Which app is for profit calculation?" therefore hit
// this canned greeting and never reached Gemini at all; the greeting was
// never Gemini-generated. Word-boundary matching (`\b...\b`) preserves
// exact/short-greeting matches ("hi", "hey") while no longer matching a
// keyword that merely happens to appear as a substring inside a longer,
// unrelated word.
function matchesKeyword(message: string, keyword: string): boolean {
  const trimmed = keyword.trim();
  if (!trimmed) return false;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(message);
}

interface AppGalleryMolarAdapterDeps {
  userChatContext: string;
}

export function createAppGalleryMolarAdapter({ userChatContext }: AppGalleryMolarAdapterDeps): AIAdapter {
  const { supabase, chatWithGemini } = getSuperappHostDependencies();
  return {
    diagnosticContext: { appId: 'superapp' },
    async sendMessage({ text, history }) {
      const userMsg = text.trim();

        let response: string | null = null;

        // 1. Check custom responses first
        const { data: apps } = await supabase
          .from('aiboard_response_target_apps')
          .select('response_id')
          .in('app_name', ['App.Snabbb', 'All']);

        if (apps && apps.length > 0) {
          const responseIds = apps.map((a: any) => a.response_id);
          const { data: keywords } = await supabase
            .from('aiboard_response_keywords')
            .select('keyword, response_id')
            .in('response_id', responseIds);

          if (keywords && keywords.length > 0) {
            const matchedKeyword = keywords.find((k: any) => matchesKeyword(userMsg, k.keyword));

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

        // 2. Fallback to Gemini
        if (!response) {
          response = await chatWithGemini(
            toGeminiHistory(history),
            userMsg,
            'SuperApp Gallery context.',
            '',
            '',
            userChatContext || undefined
          );
        }

        return { text: response as string, meta: { source: 'general' } };
    },
  };
}
