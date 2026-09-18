export interface SavedPlan {
  id: string; date: string; timeframe: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  results: { isProfitable: boolean; totalProcedures: number };
}
