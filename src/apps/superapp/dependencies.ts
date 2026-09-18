export interface SuperappHostDependencies {
  supabase: any;
  useCreateAppLink: () => { mutateAsync: (input: { app: string; email: string; name?: string }) => Promise<unknown> };
  getAuthUser: () => { username: string; name?: string } | null;
  miniApps: Array<{ title: string; route?: string }>;
  chatWithGemini?: (...args: any[]) => Promise<string>;
  personalizedDialogueEnabled: boolean;
}

let dependencies: (SuperappHostDependencies & { chatWithGemini: (...args: any[]) => Promise<string> }) | null = null;

export function configureSuperappHostDependencies(next: SuperappHostDependencies): void {
  dependencies = { ...next, chatWithGemini: next.chatWithGemini ?? createSuperappSNAIService(next.supabase).chatWithGemini };
}

export function getSuperappHostDependencies(): SuperappHostDependencies & { chatWithGemini: (...args: any[]) => Promise<string> } {
  if (!dependencies) throw new Error('Superapp pet dependencies have not been configured.');
  return dependencies;
}
import { createSuperappSNAIService } from './snaiService';
