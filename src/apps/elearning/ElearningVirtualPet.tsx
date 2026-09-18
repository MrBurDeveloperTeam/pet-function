import { SharedHostedVirtualPet, type ExtraGame, type PetHostClient } from '../../pet';
import type { PetRepository } from '../../contracts';

export function createElearningVirtualPet(client: PetHostClient, elearningPetRepository: PetRepository) {
return function ElearningVirtualPet(props: {
  isOpen: boolean;
  onClose: () => void;
  extraGames?: ExtraGame[];
}) {
  return <SharedHostedVirtualPet {...props} client={client} repository={elearningPetRepository} />;
};
}
