export interface InventoryChatServices {
  chatWithGemini(history: { role: 'user' | 'model'; parts: { text: string }[] }[], message: string, inventoryContext: string, purchaseHistory?: string, activityLogs?: string, userContext?: string): Promise<string>;
  chatWithGroundedInventoryFacts(question: string, intent: string, facts: unknown): Promise<string>;
  routeInventoryCapability(message: string, capabilities: { id: string; description: string }[], recentContext: string[], previousCapability: string | null): Promise<{ route: 'grounded' | 'general_chat' | 'clarification'; capability: string | null; confidence: 'high' | 'low'; clarification: string | null }>;
}
