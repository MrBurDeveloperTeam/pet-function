import { useEffect, useRef } from 'react';
import { getPetOption, type PetId } from '../petOptions';
import type { PetAssetUrls } from '../types';
import { useTypewriterDialogue } from './useTypewriterDialogue';

export function NpcDialogue({ petId, spriteSheets, text, onClose }: {
  petId: PetId;
  spriteSheets?: PetAssetUrls['spriteSheets'];
  text: string;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const advanceRef = useRef<HTMLButtonElement>(null);
  const pet = getPetOption(petId, spriteSheets);
  const { visibleText, complete, advance } = useTypewriterDialogue({ text, onClose });

  useEffect(() => {
    const previousFocus = document.activeElement;
    closeRef.current?.focus({ preventScroll: true });
    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, []);

  return (
    <div className="pet-npc-dialogue" role="dialog" aria-label="Cat conversation" aria-modal="true"
      data-pet-movement-block
      onPointerDown={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
      onKeyDown={event => {
        if (event.key === 'Tab') {
          event.preventDefault();
          const next = document.activeElement === closeRef.current ? advanceRef.current : closeRef.current;
          next?.focus();
        }
      }}>
      <div className="pet-npc-dialogue-portrait" aria-hidden="true">
        <div className="pet-npc-dialogue-cat" style={{ backgroundImage: `url("${pet.spriteSheetUrl}")` }} />
      </div>
      <div className="pet-npc-dialogue-panel">
        <p className="pet-npc-dialogue-text">
          <span aria-hidden="true">{visibleText}</span>
          <span className="sr-only" aria-live="polite" aria-atomic="true">{text}</span>
        </p>
        <div className="pet-npc-dialogue-controls">
          <span className="pet-npc-dialogue-key-hint" aria-hidden="true">Space · {complete ? 'Close' : 'Skip'}<span>Click outside to close</span></span>
          <button ref={advanceRef} type="button" className="pet-dialogue-advance"
            aria-label={complete ? 'Close dialogue' : 'Show full dialogue'} onClick={advance}>{complete ? 'Close' : 'Skip'}</button>
        </div>
      </div>
      <button ref={closeRef} type="button" className="pet-npc-dialogue-close"
        aria-label="Close dialogue" onClick={onClose}><span aria-hidden="true">×</span></button>
    </div>
  );
}
