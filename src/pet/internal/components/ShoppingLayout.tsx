import type { CSSProperties, ReactNode } from 'react';
import { useGameState } from '../../runtime/SharedPetRuntime';
import { getPetOption } from '../petOptions';
import { ShopkeeperDialogue } from './ShopDialogue';

/** Shared by every Shopping Street shelf, including nested room decor pages. */
export function ShoppingLayout({ children }: { children: ReactNode }) {
  const { petName } = useGameState();
  const pet = getPetOption(petName);

  return <div className="pet-shopping-layout" data-pet-movement-block>
    <aside className="pet-shopkeeper" data-shopkeeper-pet={pet.id}>
      <ShopkeeperDialogue/>
      <div key={pet.id} className="pet-shopkeeper-sprite" role="img" aria-label={`${pet.label} shopkeeper`} style={{
        backgroundImage: `url('/pet-function/shopkeepers/${pet.id}.webp')`,
      } as CSSProperties}/>
    </aside>
    {children}
  </div>;
}
