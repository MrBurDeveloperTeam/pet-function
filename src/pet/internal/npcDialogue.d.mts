export type NpcDialogueMood = 'happy' | 'calm' | 'excited' | 'sad' | 'grumpy' | 'sleepy' | 'hungry' | 'curious';
export interface NpcDialogueLine {
  readonly mood: NpcDialogueMood;
  readonly text: string;
}
export interface NpcDialoguePosition {
  readonly x: number;
  readonly y: number;
}
export const NPC_DIALOGUE_POOLS: Readonly<Record<NpcDialogueMood, readonly string[]>>;
export function createNpcDialoguePicker(random?: () => number): (npcId: string) => NpcDialogueLine;
export function findNearbyNpc(
  positions: Readonly<Record<string, NpcDialoguePosition>>,
  player: NpcDialoguePosition,
  maxDistance: number,
): string | null;
