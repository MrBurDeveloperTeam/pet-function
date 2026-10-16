import type { MeowConfiguration, MeowState, MeowTiming } from './meowTypes';

export const MEOW_STATES: readonly MeowState[];
export const MAX_MEOW_TEXT_LENGTH: 500;
export const DEFAULT_MEOW_LINES: Readonly<Record<MeowState, readonly string[]>>;
export const DEFAULT_MEOW_TIMING: Readonly<Record<MeowState, Readonly<MeowTiming>>>;
export function validateMeowText(text: unknown): string;
export function normalizeMeowConfiguration(messageRows?: unknown[], timingRows?: unknown[]): MeowConfiguration;
export function resolveMeowCycle(config: MeowConfiguration | null | undefined, states: readonly string[]): {
  lines: string[];
  durationMs: number;
  intervalMs: number;
} | null;
export function createMeowLinePicker(random?: () => number): (lines: readonly string[]) => string | null;
