import { RoomType } from './types';

export type NormalizedPoint = { x: number; y: number };
type Polygon = NormalizedPoint[];

export const OUTDOOR_ROOMS = new Set<RoomType>([
  RoomType.PLAYROOM,
  RoomType.TOWN_HOME,
  RoomType.SHOPPING_STREET,
  RoomType.SPORTS_GROUND,
]);

// Coordinates are traced against the 1862x845 room artwork. Only the new
// connected maps need authored collision masks; legacy Outside stays open.
const WALKABLE_POLYGONS: Partial<Record<RoomType, Polygon[]>> = {
  [RoomType.TOWN_HOME]: [
    [
      { x: 0, y: 0.21 }, { x: 0.22, y: 0.24 }, { x: 0.42, y: 0.35 },
      { x: 0.79, y: 0.37 }, { x: 0.84, y: 0.55 }, { x: 0.67, y: 0.63 },
      { x: 0.43, y: 0.55 }, { x: 0.22, y: 0.39 }, { x: 0, y: 0.34 },
    ],
    [
      { x: 0.62, y: 0.50 }, { x: 0.85, y: 0.48 }, { x: 0.90, y: 0.78 },
      { x: 0.66, y: 0.82 }, { x: 0.58, y: 0.68 },
    ],
  ],
  [RoomType.SHOPPING_STREET]: [
    [
      { x: 0.05, y: 0.43 }, { x: 1, y: 0.30 }, { x: 1, y: 0.62 },
      { x: 0.42, y: 0.70 }, { x: 0.42, y: 1 }, { x: 0.25, y: 1 },
      { x: 0.25, y: 0.68 }, { x: 0.05, y: 0.58 },
    ],
  ],
  [RoomType.SPORTS_GROUND]: [
    [
      { x: 0.43, y: 0 }, { x: 0.57, y: 0 }, { x: 0.58, y: 0.25 },
      { x: 0.63, y: 0.29 }, { x: 0.63, y: 0.36 }, { x: 0.37, y: 0.36 },
      { x: 0.37, y: 0.29 }, { x: 0.42, y: 0.25 },
    ],
  ],
};

export const OUTDOOR_INITIAL_PLACEMENT: Partial<Record<RoomType, NormalizedPoint>> = {
  [RoomType.PLAYROOM]: { x: 0.5, y: 0.55 },
  [RoomType.TOWN_HOME]: { x: 0.55, y: 0.48 },
  [RoomType.SHOPPING_STREET]: { x: 0.84, y: 0.53 },
  [RoomType.SPORTS_GROUND]: { x: 0.5, y: 0.25 },
};

const pointInPolygon = (point: NormalizedPoint, polygon: Polygon) => {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const a = polygon[index];
    const b = polygon[previous];
    const crosses = (a.y > point.y) !== (b.y > point.y)
      && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
};

const closestPointOnSegment = (point: NormalizedPoint, start: NormalizedPoint, end: NormalizedPoint) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const amount = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return { x: start.x + amount * dx, y: start.y + amount * dy };
};

const isWalkable = (room: RoomType, point: NormalizedPoint) => {
  const polygons = WALKABLE_POLYGONS[room];
  return !polygons || polygons.some((polygon) => pointInPolygon(point, polygon));
};

const closestWalkablePoint = (room: RoomType, point: NormalizedPoint) => {
  const polygons = WALKABLE_POLYGONS[room];
  if (!polygons || isWalkable(room, point)) return point;

  let closest = point;
  let closestDistance = Number.POSITIVE_INFINITY;
  polygons.forEach((polygon) => {
    polygon.forEach((start, index) => {
      const candidate = closestPointOnSegment(point, start, polygon[(index + 1) % polygon.length]);
      const distance = (candidate.x - point.x) ** 2 + (candidate.y - point.y) ** 2;
      if (distance < closestDistance) {
        closest = candidate;
        closestDistance = distance;
      }
    });
  });
  return closest;
};

export const constrainOutdoorPosition = (
  room: RoomType,
  current: { x: number; y: number },
  proposed: { x: number; y: number },
  width: number,
  height: number,
) => {
  if (width <= 0 || height <= 0) return current;
  const normalizedCurrent = { x: current.x / width, y: current.y / height };
  const normalizedProposed = {
    x: Math.max(0, Math.min(1, proposed.x / width)),
    y: Math.max(0, Math.min(1, proposed.y / height)),
  };
  if (isWalkable(room, normalizedProposed)) return proposed;

  const horizontalOnly = { x: normalizedProposed.x, y: normalizedCurrent.y };
  if (isWalkable(room, horizontalOnly)) return { x: horizontalOnly.x * width, y: horizontalOnly.y * height };

  const verticalOnly = { x: normalizedCurrent.x, y: normalizedProposed.y };
  if (isWalkable(room, verticalOnly)) return { x: verticalOnly.x * width, y: verticalOnly.y * height };

  const closest = closestWalkablePoint(room, normalizedProposed);
  return { x: closest.x * width, y: closest.y * height };
};
