/** Personal, plain-text ambient sayings shared with AIBoard's Meow Dialogue. */
export type MeowState = 'Normal' | 'Hungry' | 'Unhappy' | 'Dirty' | 'Low Energy';

export interface MeowPreset {
  id: string;
  state: MeowState;
  text: string;
}

export interface MeowTiming {
  durationMs: number;
  intervalMs: number;
  disabled: boolean;
}

export interface MeowConfiguration {
  presets: MeowPreset[];
  timing: Partial<Record<MeowState, MeowTiming>>;
}

/** Hosts provide their current authenticated client through a thin adapter. */
export interface MeowPresetRepository {
  load(ownerId: string): Promise<MeowConfiguration>;
  add(ownerId: string, state: MeowState, text: string): Promise<MeowPreset>;
  update(ownerId: string, id: string, text: string, expectedText?: string): Promise<MeowPreset>;
  remove(ownerId: string, id: string, expectedText?: string): Promise<void>;
}

/** Presentation-only editor surface. Account changes discard this owner's drafts. */
export interface MeowPresetController {
  ownerId: string | null;
  status: 'loading' | 'ready' | 'error';
  presets: MeowPreset[];
  pending: boolean;
  error: string | null;
  editing: boolean;
  setEditing(open: boolean): void;
  reload(): Promise<void>;
  add(state: MeowState, text: string): Promise<boolean>;
  update(id: string, text: string, expectedText?: string): Promise<boolean>;
  remove(id: string, expectedText?: string): Promise<boolean>;
}
