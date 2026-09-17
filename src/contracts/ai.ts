/**
 * AI chat contracts.
 *
 * The shared package owns only the chat UI shell. It must never import a
 * Gemini/OpenAI SDK type, a Supabase type, or any host Data Chat type — the
 * host's `AIAdapter.sendMessage` implementation is a black box to this
 * package that happens to return this normalized shape.
 */

export interface AIMessage {
  role: 'user' | 'model';
  text: string;
}

export interface AIRequest {
  text: string;
  history: AIMessage[];
  signal?: AbortSignal;
}

export interface HostActionDescriptor<TPayload = unknown> {
  actionId: string;
  payload: TPayload;
}

export interface AIResponse {
  text: string;
  meta?: { source: 'general' | 'data-chat' | 'fallback' };
  /** Present only if the host's own orchestration already validated an
   *  action inside `sendMessage` — the shared UI never parses this itself,
   *  it only forwards it to `HostActionAdapter.execute` if provided. */
  hostAction?: HostActionDescriptor;
}

export interface AIAdapter {
  sendMessage(request: AIRequest): Promise<AIResponse>;
  /**
   * Optional generic conversation-lifecycle hook. Called when the user
   * clears the chat via the shared UI's own "Clear conversation" button
   * (see SharedMolarAI.tsx's `handleClear`) — BEFORE this hook existed,
   * clearing only reset the rendered `chatHistory` state; any grounded
   * conversation context an adapter holds internally (last resolved
   * intent/facts/entity references, used for follow-up questions like
   * "which one should I do first?") had no way to be told the visible
   * conversation had restarted, and would incorrectly keep answering
   * follow-ups against a conversation the user believes is gone.
   *
   * Adapters that hold no such state may simply omit this. The shared
   * package never inspects what an adapter does inside it — this is
   * purely a lifecycle notification, never a data payload.
   */
  reset?(): void;
}
