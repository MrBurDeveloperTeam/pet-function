'use client';
import { createContext, useContext, useState, type ReactNode } from 'react';
import { SharedCatMascot } from './SharedCatMascot';
import { CAT_SPRITE_SHEET_URLS } from '../resources';

interface PreviewState {
  bubble: ReactNode;
  setBubble: (node: ReactNode) => void;
  onCatClick: (() => void) | undefined;
  setOnCatClick: (fn: (() => void) | undefined) => void;
}
const Context = createContext<PreviewState | null>(null);
export function SharedCatPreviewProvider({ children }: { children: ReactNode }) {
  const [bubble, setBubble] = useState<ReactNode>(null);
  const [onCatClick, setOnCatClick] = useState<(() => void) | undefined>();
  return <Context.Provider value={{ bubble, setBubble, onCatClick, setOnCatClick }}>{children}</Context.Provider>;
}
export function useSharedCatPreview() {
  const state = useContext(Context);
  if (!state) throw new Error('Cat preview requires SharedCatPreviewProvider');
  return state;
}
export function SharedPreviewCatMascot() {
  const { bubble, onCatClick } = useSharedCatPreview();
  return <SharedCatMascot petId="mallow" spriteSheetUrls={CAT_SPRITE_SHEET_URLS} bubbleContent={bubble} onCatClick={onCatClick} />;
}
