export interface ElearningChatServices {
  chatWithMolarAI(history: { role: 'user' | 'model'; parts: { text: string }[] }[], message: string, userContext?: string): Promise<string>;
  chatWithGroundedElearningFacts(question: string, intent: string, facts: unknown): Promise<string>;
  routeElearningCapability(message: string, capabilities: { id: string; description: string }[], recentContext: string[], previousCapability: string | null): Promise<{ route: 'grounded' | 'general_chat' | 'clarification'; capability: string | null; confidence: 'high' | 'low'; clarification: string | null }>;
}

