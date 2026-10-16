import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { PixelCoinBag } from './CoinIndicator';
import { ShoppingLayout } from './ShoppingLayout';
import { useShopDialogue } from './ShopDialogue';

/** Wardrobe variant of the existing pixel shop shell, with modal focus ownership. */
export function PixelShopDialog({ title, subtitle, coins, onClose, children, shopkeeper = false }: {
  title: string; subtitle: string; coins: number; onClose: () => void; children: React.ReactNode; shopkeeper?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const { requestClose } = useShopDialogue();
  const closeDialog = shopkeeper ? requestClose ?? onClose : onClose;
  const onCloseRef = useRef(closeDialog); onCloseRef.current = closeDialog;
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const siblings = Array.from((root.current?.parentElement ?? document.body).children).filter((element): element is HTMLElement => element instanceof HTMLElement && element !== root.current);
    const oldInert = siblings.map(element => element.inert);
    siblings.forEach(element => { element.inert = true; });
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    close.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); onCloseRef.current(); }
      if (event.key !== 'Tab') return;
      const elements = Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]') ?? []).filter(element => element.getClientRects().length > 0);
      if (!elements.length) { event.preventDefault(); return; }
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || !root.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('keydown', key, true);
      siblings.forEach((element, index) => { element.inert = oldInert[index]; });
      document.body.style.overflow = overflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  const dialog = <section role="dialog" aria-modal="true" aria-labelledby={titleId} className={`pet-wardrobe-dialog${shopkeeper ? ' pet-shopping-panel' : ''}`}>
      <header className="pet-wardrobe-header">
        <div><h2 id={titleId}>{title}</h2><p>{subtitle}</p></div>
        <span className="pet-wardrobe-wallet"><PixelCoinBag/>{coins.toLocaleString()}</span>
        <button ref={close} type="button" className="pet-wardrobe-icon" onClick={closeDialog} aria-label="Close wardrobe"><X size={24}/></button>
      </header>
      {children}
    </section>;
  return createPortal(<div ref={root} className={`snabbb-molar-experience pet-wardrobe-modal${shopkeeper ? ' pet-shopping-modal' : ''}`} data-theme="light">
    {shopkeeper ? <ShoppingLayout>{dialog}</ShoppingLayout> : dialog}
  </div>, document.fullscreenElement ?? document.body);
}
