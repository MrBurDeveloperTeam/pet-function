import type { SnabbbAppId } from './appId';
import type { MolarIdentity } from './identity';
import type { DialogueAdapter, DialogueRuntimeConfig } from './dialogue';
import type { AIAdapter } from './ai';
import type { HostActionAdapter } from './hostAction';
import type { PetRepository } from './petRepository';

/**
 * Typed composition config for `MolarExperienceProvider` — deliberately NOT
 * one large untyped object. Every domain adapter is optional except
 * `appId`/`identity`, because incremental per-domain migration is a hard
 * requirement (see README "Incremental adoption"): a host must be able to
 * adopt Cat only, AI only, or Pet only, without wiring the other two.
 */
export interface MolarExperienceConfig {
  appId: SnabbbAppId;
  identity: MolarIdentity;

  dialogue?: DialogueAdapter;
  dialogueRuntime?: DialogueRuntimeConfig;

  ai?: AIAdapter;
  hostActions?: HostActionAdapter;

  petRepository?: PetRepository;
}
