export interface SuperappHostDependencies {
  supabase: any;
  useCreateAppLink: () => { mutateAsync: (input: { app: string; email: string; name?: string }) => Promise<unknown> };
  getAuthUser: () => { username: string; name?: string } | null;
  miniApps: Array<{ title: string; route?: string }>;
  chatWithGemini: (...args: any[]) => Promise<string>;
  personalizedDialogueEnabled: boolean;
}

let dependencies: SuperappHostDependencies | null = null;

export function configureSuperappHostDependencies(next: SuperappHostDependencies): void {
  dependencies = next;
}

export function getSuperappHostDependencies(): SuperappHostDependencies {
  if (!dependencies) throw new Error('Superapp pet dependencies have not been configured.');
  return dependencies;
}
