import type { PetRepository } from '../../contracts/petRepository';
export function createWardrobeCloud(client: any): Required<Pick<PetRepository, 'loadWardrobe' | 'purchaseWardrobeItem' | 'equipWardrobeItem'>>;
