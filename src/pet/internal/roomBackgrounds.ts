import { RoomType } from './types';

// Shipped through the hosts' existing prepare-pet public-resource pipeline.
const bathroom = '/pet-function/rooms/bathroom.png';
const bedroom = '/pet-function/rooms/bedroom.png';
const games = '/pet-function/rooms/game.png';
const kitchen = '/pet-function/rooms/kitchen.png';
const outside = '/pet-function/rooms/outside.png';

// Outside navigation uses PLAYROOM; GARDEN shares the outdoor artwork.
export const ROOM_BACKGROUNDS: Record<RoomType, string> = {
  [RoomType.BATHROOM]: bathroom,
  [RoomType.BEDROOM]: bedroom,
  [RoomType.GAMES]: games,
  [RoomType.KITCHEN]: kitchen,
  [RoomType.PLAYROOM]: outside,
  [RoomType.GARDEN]: outside,
};
