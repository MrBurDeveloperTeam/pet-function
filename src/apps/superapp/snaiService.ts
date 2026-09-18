type ChatHistory = {
  role: "user" | "model";
  parts: { text: string }[];
};

export function createSuperappSNAIService(supabase: any, fetch: typeof globalThis.fetch = (...args) => globalThis.fetch(...args)) {
void fetch;
// Client-side transport layer only. This file must NEVER import
// @google/genai, construct a GoogleGenAI client, read
// VITE_GEMINI_API_KEY, or call generateContent directly — all of that now
// lives exclusively in the server-only Supabase Edge Function at
// supabase/functions/molar-chat-app-gallery/index.ts, which this file
// calls via supabase.functions.invoke(). That invocation automatically
// carries the browser's current authenticated Supabase session as the
// Authorization bearer token — no token is ever placed into the request
// body/prompt here. Public function signature is preserved so
// aiExperience/appGalleryMolarAdapter.ts requires no change.
//
// Deployed under "molar-chat-app-gallery", not the generic "molar-chat"
// slug — this shared Supabase project already hosts a "molar-chat"
// function for the Appointment app with different, clinic-specific
// system prompts; reusing that name here would silently overwrite it.



const chatWithGemini = async (
  history: ChatHistory[],
  message: string,
  _inventoryContext: string,
  _purchaseHistory?: string,
  _activityLogs?: string,
  userContext?: string,
): Promise<string> => {
  try {
    const { data, error } = await supabase.functions.invoke('molar-chat-app-gallery', {
      body: { message, history, userContext: userContext || '' },
    });

    if (error || !data?.ok) {
      throw new Error(data?.error || error?.message || 'AI service request failed');
    }

    return data.text;
  } catch (error) {
    console.error("Gemini Chat Error:", error);
    return "I'm having trouble connecting to the Snabbb Assistant Intelligent servers right now. Please try again shortly.";
  }
};

return { chatWithGemini };
}
