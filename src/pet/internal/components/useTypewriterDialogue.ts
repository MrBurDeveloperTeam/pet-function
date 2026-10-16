import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createTypewriterDialogue, handleTypewriterSpace, type TypewriterSnapshot } from './typewriterDialogue.mjs';

export function useTypewriterDialogue({ text, messageKey, onClose, keyboard = true }: {
  text: string | null;
  messageKey?: string | number;
  onClose: () => void;
  keyboard?: boolean;
}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const controllerRef = useRef<ReturnType<typeof createTypewriterDialogue> | null>(null);
  const [frame, setFrame] = useState<TypewriterSnapshot & { text: string | null; messageKey?: string | number }>({
    text, messageKey, visibleText: '', complete: false,
  });

  useLayoutEffect(() => {
    if (text === null) return;
    const controller = createTypewriterDialogue({
      text,
      onChange: snapshot => setFrame({ ...snapshot, text, messageKey }),
      onClose: () => closeRef.current(),
    });
    controllerRef.current = controller;
    return () => {
      controller.dispose();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [text, messageKey]);

  const advance = useCallback(() => controllerRef.current?.advance(), []);
  useEffect(() => {
    if (text === null || !keyboard) return;
    const onKeyDown = (event: KeyboardEvent) => handleTypewriterSpace(event, advance);
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [text, keyboard, advance]);

  // Do not paint the previous line while a new line's effect is being installed.
  const current = text !== null && frame.text === text && frame.messageKey === messageKey;
  return { visibleText: current ? frame.visibleText : '', complete: current && frame.complete, advance };
}
