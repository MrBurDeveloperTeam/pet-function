import type { PetRepository } from '../../contracts/petRepository';
export function createCabinetCloud(client:any):Required<Pick<PetRepository,'loadCabinets'|'purchaseCabinetItem'|'selectCabinetItem'>>;
