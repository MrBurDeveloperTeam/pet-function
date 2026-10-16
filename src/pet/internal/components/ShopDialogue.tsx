import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { createShopDialoguePicker, type ShopDialogueKind } from '../shopDialogue.mjs';
import { useTypewriterDialogue } from './useTypewriterDialogue';

type ShopLine = { id: number; kind: ShopDialogueKind; text: string };
type ShopDialogueState = {
  say: (kind: ShopDialogueKind) => void;
  closing: boolean;
  dialogueActive: boolean;
  requestClose: (() => void) | undefined;
  line: ShopLine | null;
  visibleText: string;
  complete: boolean;
  advance: () => void;
};
const ShopDialogueContext = createContext<ShopDialogueState>({
  say: () => {}, closing: false, dialogueActive: false, requestClose: undefined,
  line: null, visibleText: '', complete: false, advance: () => {},
});
export const useShopDialogue = () => useContext(ShopDialogueContext);

/** One conversation survives shelf navigation; changing shops starts a fresh welcome. */
export function ShopDialogueProvider({ enabled, onClose, children }: {
  enabled: boolean; onClose: () => void; children: ReactNode;
}) {
  const [pick] = useState(() => createShopDialoguePicker());
  const sequence = useRef(1);
  const [line, setLine] = useState<ShopLine | null>(() => enabled ? { id: 1, kind: 'welcome', text: pick('welcome') } : null);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const closedRef = useRef(false);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const say = useCallback((kind: ShopDialogueKind) => {
    if (!enabled || closingRef.current || closedRef.current) return;
    setLine({ id: ++sequence.current, kind, text: pick(kind) });
  }, [enabled, pick]);
  const requestClose = useCallback(() => {
    if (!enabled || closingRef.current || closedRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setLine({ id: ++sequence.current, kind: 'farewell', text: pick('farewell') });
  }, [enabled, pick]);
  const dismiss = useCallback(() => {
    if (closedRef.current) return;
    if (closingRef.current) {
      closedRef.current = true;
      closeRef.current();
    } else {
      setLine(null);
    }
  }, []);
  const writer = useTypewriterDialogue({ text: line?.text ?? null, messageKey: line?.id, onClose: dismiss });

  return <ShopDialogueContext.Provider value={{
    say, closing, dialogueActive: line !== null, requestClose: enabled ? requestClose : undefined,
    line, ...writer,
  }}>{children}</ShopDialogueContext.Provider>;
}

export function ShopkeeperDialogue() {
  const { line, visibleText, complete, advance } = useShopDialogue();
  if (!line) return null;
  return <section className="pet-npc-dialogue-panel pet-shopkeeper-dialogue" aria-label="Shopkeeper dialogue"
    data-shop-dialogue-kind={line.kind} data-dialogue-complete={complete}
    onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
    <p className="pet-npc-dialogue-text"><span aria-hidden="true">{visibleText}</span></p>
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{complete ? line.text : ''}</span>
    <div className="pet-npc-dialogue-controls">
      <span className="pet-npc-dialogue-key-hint" aria-hidden="true">Space · {complete ? 'Close' : 'Skip'}</span>
      <button type="button" className="pet-dialogue-advance" onClick={advance}
        aria-label={complete ? 'Close shopkeeper dialogue' : 'Skip shopkeeper typing'}>{complete ? 'Close' : 'Skip'}</button>
    </div>
  </section>;
}
