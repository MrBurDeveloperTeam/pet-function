import { RoomType } from './types';

export type NormalizedPoint = { x: number; y: number };
type Polygon = NormalizedPoint[];

export const OUTDOOR_ROOMS = new Set<RoomType>([
  RoomType.PLAYROOM,
  RoomType.TOWN_HOME,
  RoomType.SHOPPING_STREET,
  RoomType.SPORTS_GROUND,
  RoomType.SPORTS_STADIUM,
  RoomType.KART_TRACK,
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
    // The karting approach passes down the east bank, clear of the pond.
    [
      { x: 0.72, y: 0.56 }, { x: 0.77, y: 0.54 }, { x: 0.81, y: 0.65 },
      { x: 0.85, y: 0.78 }, { x: 0.87, y: 1 }, { x: 0.80, y: 1 },
      { x: 0.78, y: 0.80 }, { x: 0.74, y: 0.68 },
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
      { x: 0.46, y: 0 }, { x: 0.54, y: 0 },
      { x: 0.54, y: 0.095 }, { x: 0.46, y: 0.095 },
    ],
    // Branch along the garden behind the stadium, never through its seating.
    [
      { x: 0.50, y: 0.012 }, { x: 0.60, y: 0.02 }, { x: 0.70, y: 0.065 },
      { x: 0.84, y: 0.125 }, { x: 1, y: 0.15 }, { x: 1, y: 0.22 },
      { x: 0.84, y: 0.20 }, { x: 0.70, y: 0.14 }, { x: 0.60, y: 0.09 },
      { x: 0.50, y: 0.085 },
    ],
  ],
  [RoomType.KART_TRACK]: [
    // Pedestrian approaches and visitor apron; the race circuit stays fenced off.
    [
      { x: 0.386, y: 0 }, { x: 0.44, y: 0 }, { x: 0.44, y: 0.24 },
      { x: 0.475, y: 0.25 }, { x: 0.463, y: 0.32 }, { x: 0.36, y: 0.36 },
      { x: 0.325, y: 0.31 }, { x: 0.343, y: 0.27 }, { x: 0.386, y: 0.22 },
    ],
    [
      { x: 0, y: 0.44 }, { x: 0.13, y: 0.45 }, { x: 0.15, y: 0.27 },
      { x: 0.20, y: 0.27 }, { x: 0.34, y: 0.27 }, { x: 0.39, y: 0.30 },
      { x: 0.365, y: 0.42 }, { x: 0.42, y: 0.48 }, { x: 0.42, y: 0.52 },
      { x: 0.33, y: 0.49 }, { x: 0.32, y: 0.46 }, { x: 0.20, y: 0.47 },
      { x: 0.18, y: 0.47 }, { x: 0.15, y: 0.52 }, { x: 0, y: 0.54 },
    ],
  ],
  [RoomType.SPORTS_STADIUM]: [
    [
      { x: 0.08, y: 0.31 }, { x: 0.92, y: 0.31 },
      { x: 0.98, y: 0.78 }, { x: 0.84, y: 0.94 },
      { x: 0.16, y: 0.94 }, { x: 0.02, y: 0.78 },
    ],
  ],
};

export const OUTDOOR_INITIAL_PLACEMENT: Partial<Record<RoomType, NormalizedPoint>> = {
  [RoomType.PLAYROOM]: { x: 0.5, y: 0.55 },
  [RoomType.TOWN_HOME]: { x: 0.55, y: 0.48 },
  [RoomType.SHOPPING_STREET]: { x: 0.84, y: 0.53 },
  [RoomType.SPORTS_GROUND]: { x: 0.5, y: 0.075 },
  [RoomType.SPORTS_STADIUM]: { x: 0.5, y: 0.84 },
  [RoomType.KART_TRACK]: { x: 0.36, y: 0.30 },
};

// Bend points keep exit-button travel on the paths in the scene artwork.
const OUTDOOR_PATH_BENDS: Partial<Record<RoomType, NormalizedPoint[]>> = {
  [RoomType.TOWN_HOME]: [
    { x: 0.20, y: 0.31 }, { x: 0.42, y: 0.43 }, { x: 0.64, y: 0.50 },
    { x: 0.75, y: 0.59 }, { x: 0.80, y: 0.77 }, { x: 0.835, y: 0.91 },
  ],
  [RoomType.SPORTS_GROUND]: [
    { x: 0.50, y: 0.06 }, { x: 0.60, y: 0.06 }, { x: 0.72, y: 0.115 },
    { x: 0.85, y: 0.17 }, { x: 0.96, y: 0.19 },
  ],
  [RoomType.KART_TRACK]: [
    { x: 0.414, y: 0.14 }, { x: 0.414, y: 0.27 }, { x: 0.357, y: 0.325 },
    { x: 0.348, y: 0.445 }, { x: 0.34, y: 0.30 }, { x: 0.26, y: 0.38 },
    { x: 0.18, y: 0.35 }, { x: 0.16, y: 0.46 },
    { x: 0.08, y: 0.49 },
  ],
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

export const getOutdoorWalkPath = (
  room: RoomType,
  current: NormalizedPoint,
  target: NormalizedPoint,
  width: number,
  height: number,
): NormalizedPoint[] => {
  const bends = OUTDOOR_PATH_BENDS[room];
  if (!bends || width <= 0 || height <= 0) return [target];
  const nodes = [
    { x: current.x / width, y: current.y / height },
    { x: target.x / width, y: target.y / height },
    ...bends,
  ];
  const visible = (a: NormalizedPoint, b: NormalizedPoint) => {
    const steps = Math.ceil(Math.hypot(a.x - b.x, a.y - b.y) * 250);
    for (let step = 1; step < steps; step += 1) {
      const t = step / steps;
      if (!isWalkable(room, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return false;
    }
    return true;
  };
  const distances = nodes.map(() => Number.POSITIVE_INFINITY);
  const previous = nodes.map(() => -1);
  const visited = new Set<number>();
  distances[0] = 0;
  while (visited.size < nodes.length) {
    let nearest = -1;
    for (let index = 0; index < nodes.length; index += 1) {
      if (!visited.has(index) && (nearest === -1 || distances[index] < distances[nearest])) nearest = index;
    }
    if (nearest === -1 || !Number.isFinite(distances[nearest]) || nearest === 1) break;
    visited.add(nearest);
    nodes.forEach((node, index) => {
      if (visited.has(index) || !visible(nodes[nearest], node)) return;
      const distance = distances[nearest] + Math.hypot((node.x - nodes[nearest].x) * width, (node.y - nodes[nearest].y) * height);
      if (distance < distances[index]) {
        distances[index] = distance;
        previous[index] = nearest;
      }
    });
  }
  if (!Number.isFinite(distances[1])) return [target];
  const path: NormalizedPoint[] = [];
  for (let index = 1; index > 0; index = previous[index]) {
    path.unshift({ x: nodes[index].x * width, y: nodes[index].y * height });
  }
  return path;
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
