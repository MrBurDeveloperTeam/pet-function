import { RoomType } from './types';

// Shipped through the hosts' existing prepare-pet public-resource pipeline.
const bathroom = '/pet-function/rooms-wide/bathroom.png';
const bedroom = '/pet-function/rooms-wide/bedroom.png';
const games = '/pet-function/rooms-wide/game.png';
const kitchen = '/pet-function/rooms-wide/kitchen.png';
const outside = '/pet-function/rooms-wide/outside.png';

// Outside navigation uses PLAYROOM; GARDEN shares the outdoor artwork.
export const ROOM_BACKGROUNDS: Record<RoomType, string> = {
  [RoomType.BATHROOM]: bathroom,
  [RoomType.BEDROOM]: bedroom,
  [RoomType.GAMES]: games,
  [RoomType.KITCHEN]: kitchen,
  [RoomType.PLAYROOM]: outside,
  [RoomType.GARDEN]: outside,
};
