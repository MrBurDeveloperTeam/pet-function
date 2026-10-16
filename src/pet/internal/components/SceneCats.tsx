import { memo, useEffect, useRef } from 'react';
import { getPetOption } from '../petOptions';
import type { PetAssetUrls, RoomType } from '../types';
import { SCENE_CATS, sampleSceneCat, type SceneCat } from '../sceneCats';
const standingCatsUrl = '/pet-function/pets/scene-standing-cats.png';

const STANDING_CELLS = { mallow: 0, silverbelt: 1, fastrat: 2, gulu: 3, munchkin: 4, mochi: 5 };

function SceneCatsLayer({ room, spriteSheets, onTalk, activeCatId, nearbyCatId, disabled }: {
  room: RoomType;
  spriteSheets?: PetAssetUrls['spriteSheets'];
  onTalk?: (cat: SceneCat) => void;
  activeCatId?: string | null;
  nearbyCatId?: string | null;
  disabled?: boolean;
}) {
  const layerRef = useRef<HTMLDivElement>(null);
  const activeCatRef = useRef(activeCatId);
  activeCatRef.current = activeCatId;
  const cats = SCENE_CATS[room] ?? [];

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer || !cats.length) return;
    const nodes = Array.from(layer.querySelectorAll<HTMLElement>('[data-scene-cat]'));
    const sprites = nodes.map(node => node.querySelector<HTMLElement>('.pet-scene-cat-sprite')!);
    const options = cats.map(cat => getPetOption(cat.pet, spriteSheets));
    let width = 0, height = 0, sceneScale = 1, left = 0, top = 0;
    const resize = () => {
      width = layer.clientWidth;
      height = layer.clientHeight;
      // Same object-fit: cover transform as the room's background image.
      sceneScale = Math.max(width / 1862, height / 845);
      left = (width - 1862 * sceneScale) / 2;
      top = (height - 845 * sceneScale) / 2;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(layer);
    // Each route owns its clock so talking freezes just that cat in place.
    // The idle clock keeps running, including its blink, during a conversation.
    const routeTimes = cats.map(() => 0);
    let elapsed = 0, previous = performance.now(), raf = 0;
    const tick = (now: number) => {
      const delta = document.hidden ? 0 : Math.min((now - previous) / 1000, .05);
      elapsed += delta;
      previous = now;
      cats.forEach((cat, index) => {
        const talking = activeCatRef.current === cat.id;
        if (!talking) routeTimes[index] += delta;
        const state = sampleSceneCat(cat, routeTimes[index]);
        const option = options[index];
        const scale = (cat.scale ?? .45) * sceneScale;
        const node = nodes[index], sprite = sprites[index];
        node.style.left = `${left + state.x * 1862 * sceneScale}px`;
        node.style.top = `${top + state.y * 845 * sceneScale}px`;
        node.style.width = `${192 * scale}px`;
        node.style.height = `${208 * scale}px`;
        // Keep the existing depth order within the independent NPC layer.
        node.style.zIndex = String(Math.round(state.y * 10));
        let row = 0, frame = 0;
        if (cat.pose === 'stand') {
          const cell = STANDING_CELLS[cat.pet];
          row = Math.floor(cell / 3);
          frame = cell % 3;
        } else if (state.walking && !talking) {
          row = state.direction > 0 ? 1 : 2;
          frame = Math.floor(routeTimes[index] * 8 + index * 2) % 8;
        } else {
          // Hold a relaxed pose; the existing idle frames supply the blink.
          const blink = (elapsed + index * .7) % 5;
          frame = blink > 4.5 ? Math.min(Math.floor((blink - 4.5) * 8), option.idleFrames - 1) : 0;
        }
        sprite.style.backgroundPosition = `${-192 * frame}px ${-208 * row}px`;
        sprite.style.transform = `scale(${scale})`;
        node.dataset.motion = state.walking && !talking ? (state.direction > 0 ? 'right' : 'left') : talking ? 'sit' : cat.pose;
      });
      raf = requestAnimationFrame(tick);
    };
    tick(previous);
    return () => { cancelAnimationFrame(raf); observer.disconnect(); };
  }, [room, cats, spriteSheets]);

  if (!cats.length) return null;
  return (
    <div ref={layerRef} className="pet-scene-cats">
      {cats.map(cat => (
        <button key={cat.id} type="button" data-scene-cat={cat.id} data-cat-kind={cat.pet}
          data-cat-pose={cat.pose} data-pet-movement-block
          data-nearby={nearbyCatId === cat.id || undefined}
          data-talking={activeCatId === cat.id || undefined}
          disabled={disabled}
          aria-label={`Talk to ${getPetOption(cat.pet, spriteSheets).label}`}
          className={`pet-scene-cat pet-scene-cat-${cat.pose}`}
          onPointerDown={event => event.stopPropagation()}
          onClick={event => { event.stopPropagation(); onTalk?.(cat); }}>
          <span className="pet-scene-cat-shadow" aria-hidden="true" />
          {cat.dialogue && <span className="pet-scene-cat-dialogue">{cat.dialogue}</span>}
          {!cat.dialogue && <span className="pet-scene-cat-talk-hint" aria-hidden="true">Talk<span className="pet-scene-cat-key-hint"> · Space</span></span>}
          <span className="pet-scene-cat-sprite" aria-hidden="true" style={{
            backgroundImage: `url(${cat.pose === 'stand' ? standingCatsUrl : getPetOption(cat.pet, spriteSheets).spriteSheetUrl})`,
          }} />
        </button>
      ))}
    </div>
  );
}

// Player movement does not change the independent NPC layer.
export const SceneCats = memo(SceneCatsLayer);
