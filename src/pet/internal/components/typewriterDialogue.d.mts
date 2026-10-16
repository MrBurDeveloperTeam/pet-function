export type TypewriterSnapshot = { visibleText: string; complete: boolean };
export function segmentDialogueText(text: string): string[];
export function createTypewriterDialogue(options: {
  text: string;
  onChange: (snapshot: TypewriterSnapshot) => void;
  onClose: () => void;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
  intervalMs?: number;
  lingerMs?: number;
}): { advance: () => void; dispose: () => void };
export function handleTypewriterSpace(event: KeyboardEvent, advance: () => void): boolean;
