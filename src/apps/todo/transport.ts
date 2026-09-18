export interface TodoCapabilityRouteResult {
  route: 'grounded' | 'general_chat' | 'clarification' | 'analytical_followup';
  capability: string | null;
  confidence: 'high' | 'low';
  clarification: string | null;
}

export interface TodoChatServices {
  chatWithMolarAI(history: { role: 'user' | 'model'; parts: { text: string }[] }[], message: string, userContext?: string): Promise<string>;
  chatWithGroundedTodoFacts(question: string, intent: string, facts: unknown): Promise<string>;
  routeTodoCapability(message: string, capabilities: { id: string; description: string }[], recentContext: string[], previousCapability: string | null): Promise<TodoCapabilityRouteResult>;
}

