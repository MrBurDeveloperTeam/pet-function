export type FishingTouchPoint = { id: number; x: number; y: number; time: number; phase: string };
export function fishingTapAction(start: FishingTouchPoint | null, end: Omit<FishingTouchPoint, 'phase'>, state: {phase: string; paused: boolean; tutorial: boolean}): 'cast' | 'power' | 'reel' | 'again' | null;
