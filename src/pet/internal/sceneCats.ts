import { RoomType } from './types';
import type { PetId } from './petOptions';

type Point = { x: number; y: number };
export interface SceneCat {
  id: string;
  pet: PetId;
  pose: 'sit' | 'stand' | 'walk';
  /** Feet/seat anchor in the original 1862 x 845 artwork. */
  position: Point;
  path?: readonly Point[];
  speed?: number;
  phase?: number;
  scale?: number;
}

export const SCENE_CATS: Partial<Record<RoomType, readonly SceneCat[]>> = {
  [RoomType.KART_TRACK]: [
    { id: 'kart-bench', pet: 'munchkin', pose: 'sit', position: { x: .254, y: .238 }, scale: .42 },
    { id: 'kart-spectator', pet: 'fastrat', pose: 'stand', position: { x: .448, y: .613 } },
  ],
  [RoomType.TOWN_HOME]: [
    { id: 'home-west-grass', pet: 'silverbelt', pose: 'stand', position: { x: .173, y: .307 } },
    { id: 'home-pond-bank', pet: 'mochi', pose: 'stand', position: { x: .376, y: .549 } },
    { id: 'home-bench', pet: 'gulu', pose: 'sit', position: { x: .859, y: .414 }, scale: .42 },
  ],
  [RoomType.SHOPPING_STREET]: [
    { id: 'shopping-fountain-bench', pet: 'fastrat', pose: 'sit', position: { x: .052, y: .589 }, scale: .40 },
    { id: 'shopping-east-bench', pet: 'gulu', pose: 'sit', position: { x: .836, y: .889 }, scale: .42 },
    { id: 'shopping-mallow', pet: 'mallow', pose: 'walk', position: { x: .235, y: .604 },
      path: [{ x: .235, y: .604 }, { x: .425, y: .625 }], speed: 43, phase: 0 },
    { id: 'shopping-silverbelt', pet: 'silverbelt', pose: 'walk', position: { x: .43, y: .658 },
      path: [{ x: .43, y: .658 }, { x: .64, y: .674 }], speed: 38, phase: 8 },
    { id: 'shopping-munchkin', pet: 'munchkin', pose: 'walk', position: { x: .55, y: .591 },
      path: [{ x: .55, y: .591 }, { x: .77, y: .59 }], speed: 47, phase: 4 },
    { id: 'shopping-mochi', pet: 'mochi', pose: 'walk', position: { x: .72, y: .661 },
      path: [{ x: .72, y: .661 }, { x: .87, y: .606 }], speed: 35, phase: 13 },
  ],
  [RoomType.SPORTS_STADIUM]: [
    { id: 'stadium-midfield', pet: 'mallow', pose: 'stand', position: { x: .464, y: .529 } },
    { id: 'stadium-corner', pet: 'mochi', pose: 'stand', position: { x: .729, y: .645 } },
  ],
};

export const CAT_ROUTE_PAUSE_SECONDS = 2;

/** Out and back along the same road, with a pause at each endpoint. */
export function sampleSceneCat(cat: SceneCat, seconds: number) {
  if (cat.pose !== 'walk' || !cat.path || cat.path.length < 2) {
    return { ...cat.position, direction: 1, walking: false };
  }
  const path = cat.path;
  const lengths = path.slice(1).map((point, index) => Math.hypot(
    (point.x - path[index].x) * 1862, (point.y - path[index].y) * 845,
  ));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  if (!total) return { ...path[0], direction: 1, walking: false };
  const duration = total / Math.max(1, cat.speed ?? 40);
  const halfCycle = duration + CAT_ROUTE_PAUSE_SECONDS;
  const cycle = halfCycle * 2;
  const time = ((seconds + (cat.phase ?? 0)) % cycle + cycle) % cycle;
  const returning = time >= halfCycle;
  const localTime = returning ? time - halfCycle : time;
  const walking = localTime < duration;
  const progress = Math.min(localTime / duration, 1);
  let distance = (returning ? 1 - progress : progress) * total;
  for (let index = 0; index < lengths.length; index++) {
    if (distance <= lengths[index] || index === lengths.length - 1) {
      const start = path[index], end = path[index + 1];
      const fraction = lengths[index] ? Math.min(distance / lengths[index], 1) : 0;
      return {
        x: start.x + (end.x - start.x) * fraction,
        y: start.y + (end.y - start.y) * fraction,
        direction: (end.x >= start.x ? 1 : -1) * (returning ? -1 : 1),
        walking,
      };
    }
    distance -= lengths[index];
  }
  return { ...cat.position, direction: 1, walking: false };
}
