import type { DialogueAdapter, DialogueCandidate } from '../contracts';

export interface DialogueRuntimeIntroInput {
  status: 'not_ready' | 'ready';
  /** Non-empty when there is Intro content to show. Empty/omitted once
   *  `status` is `'ready'` means "no Intro configured" — the runtime marks
   *  Intro complete immediately and shows nothing else this activation,
   *  matching the pre-extraction behavior exactly. */
  steps?: string[];
}

export interface DialogueRuntimeWelcomeBackInput {
  status: 'not_ready' | 'ready';
  message?: string | null;
  /** Falls back to the runtime's own default (6000ms) if omitted or
   *  invalid — matches the pre-extraction default exactly. */
  autoCloseMs?: number;
}

export interface DialogueRuntimeInput<
  TCandidate extends DialogueCandidate = DialogueCandidate
> {
  appId: string;
  /** The host's own local user identity (NOT the Global Pet
   *  `globalUserId` — dialogue dismissal state is intentionally
   *  per-app, see contracts/identity.ts). `null` while unresolved. */
  userId: string | null;
  disabled?: boolean;
  /** Omit entirely if the host has no Intro concept. */
  intro?: DialogueRuntimeIntroInput;
  /** Omit entirely if the host has no personalized/proactive reminder
   *  concept — the runtime falls straight through to Welcome Back. */
  personalized?: DialogueAdapter<TCandidate>;
  /** Omit entirely if the host has no Welcome Back concept — the runtime
   *  will wait indefinitely once it would otherwise show Welcome Back. */
  welcomeBack?: DialogueRuntimeWelcomeBackInput;
}

export interface DialogueRuntimeResult {
  /** Feed directly into <SharedCatMascot dialogue={...} />. */
  dialogue: import('./presentation').CatDialoguePresentation;
  /** Closes whatever dialogue is currently active (persisting dismissal
   *  exactly as an explicit Close would). The host composes this with its
   *  own onCatClick prop — e.g. `onCatClick={() => { closeActiveDialogue();
   *  openVirtualPet(); }}` — matching the pre-extraction behavior where a
   *  Cat click while a dialogue is open also dismisses it. */
  closeActiveDialogue: () => void;
}
