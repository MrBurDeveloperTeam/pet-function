type ChatHistory = {
  role: "user" | "model";
  parts: { text: string }[];
};

import { createAuthorizedSnaiTransport } from '../../ai/internal/snaiTransport';

export function createSuperappSNAIService(supabase: any, fetch: typeof globalThis.fetch = (...args) => globalThis.fetch(...args)) {
// Thin client transport only. The shared `snai-chat` Edge Function owns
// authentication verification, prompts, model calls and response validation.
// This host supplies only its authenticated Supabase client and authorized data.



const invokeSnai = createAuthorizedSnaiTransport(supabase, 'superapp', fetch);

const chatWithGemini = async (
  history: ChatHistory[],
  message: string,
  _inventoryContext: string,
  _purchaseHistory?: string,
  _activityLogs?: string,
  userContext?: string,
): Promise<string> => {
  const data = await invokeSnai({ mode: 'general', message, history, userContext: userContext || '' });
  return data.text;
};

return { chatWithGemini };
}
