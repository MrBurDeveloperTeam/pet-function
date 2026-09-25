import { RoomType } from '../types';

// Traced in the rooms-wide artwork coordinate system; slice matches object-fit: cover.
type RoomInteractionAction = 'food' | 'bath' | 'games' | 'door' | 'food-shop' | 'furniture-shop';

const outlines: Partial<Record<RoomType, { action: RoomInteractionAction; label: string; d: string }[]>> = {
  [RoomType.KITCHEN]: [
    { action: 'food', label: 'Open food inventory', d: 'M365 177 H521 L535 185 L543 201 V495 L533 510 H528 V523 H506 V513 H378 V523 H358 V510 L349 500 V194 L355 183 Z' },
    { action: 'door', label: 'Go outside through the kitchen door', d: 'M1444 107 H1708 V519 H1444 Z' },
  ],
  [RoomType.BATHROOM]: [
    { action: 'bath', label: 'Use bath tools', d: 'M558 405 L579 397 L615 393 H887 L916 399 L935 408 V420 L923 430 L910 480 L900 502 L882 514 L889 531 L886 548 L873 553 L858 548 L852 535 L857 522 H637 L633 539 L626 551 L608 552 L601 544 L605 528 L610 514 L592 497 L581 472 L568 430 L558 423 Z' },
    { action: 'door', label: 'Go to bedroom through the bathroom door', d: 'M307 100 L427 127 L441 141 V538 L428 555 L307 571 Z' },
  ],
  [RoomType.GAMES]: [
    { action: 'games', label: 'Play games on the television', d: 'M914 216 H923 V212 H1065 L1079 218 V333 L1072 341 V350 H919 V342 H908 L901 334 V226 L906 219 Z' },
    { action: 'games', label: 'Play games on the left arcade machine', d: 'M597 220 H683 L691 216 L703 225 V329 L692 347 V451 L686 462 H587 V352 L598 336 L605 263 L597 257 Z' },
    { action: 'games', label: 'Play games on the right arcade machine', d: 'M707 220 H791 L798 216 L814 225 V450 L803 461 H697 V351 L706 333 L711 263 L704 253 Z' },
    // The door sits on the receding left wall: its upper and lower rails follow a
    // 20-degree rise, so the visible frame reads at the requested 70-degree angle.
    { action: 'door', label: 'Go home through the games room door', d: 'M257 101 L366 141 L366 486 L257 446 Z' },
  ],
  [RoomType.TOWN_HOME]: [
    { action: 'door', label: 'Enter the games room through the home door', d: 'M989 178 H1086 V347 H989 Z' },
  ],
  [RoomType.SHOPPING_STREET]: [
    { action: 'food-shop', label: 'Open the food shop', d: 'M593 286 H657 V439 H593 Z' },
    { action: 'furniture-shop', label: 'Open the furniture shop', d: 'M905 284 H970 V439 H905 Z' },
  ],
};

export function RoomInteractionOutlines({ room, hidden, onActivate }: {
  room: RoomType;
  hidden: boolean;
  onActivate: (action: RoomInteractionAction) => void;
}) {
  if (hidden || !outlines[room]) return null;
  return (
    <svg viewBox="0 0 1862 845" preserveAspectRatio="xMidYMid slice"
      className="pet-interaction-outlines" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 15, pointerEvents: 'none' }}>
      {outlines[room]!.map(({ action, label, d }) => (
        <path key={label} d={d} className="pet-interaction-outline" role="button"
          tabIndex={0} aria-label={label} data-pet-interaction-action={action} data-pet-movement-block
          vectorEffect="non-scaling-stroke"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onActivate(action)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.code === 'Space') {
              event.preventDefault();
              event.stopPropagation();
              if (!event.repeat) onActivate(action);
            }
          }} />
      ))}
    </svg>
  );
}
