import { useEffect, useRef } from 'react';
import { getPetOption } from '../petOptions';
import type { PetAssetUrls, RoomType } from '../types';
import { SCENE_CATS, sampleSceneCat } from '../sceneCats';
const standingCatsUrl = '/pet-function/pets/scene-standing-cats.png';

const STANDING_CELLS = { mallow: 0, silverbelt: 1, fastrat: 2, gulu: 3, munchkin: 4, mochi: 5 };

export function SceneCats({ room, spriteSheets }: {
  room: RoomType;
  spriteSheets?: PetAssetUrls['spriteSheets'];
}) {
  const layerRef = useRef<HTMLDivElement>(null);
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
    let elapsed = 0, previous = performance.now(), raf = 0;
    const tick = (now: number) => {
      if (!document.hidden) elapsed += Math.min((now - previous) / 1000, .05);
      previous = now;
      cats.forEach((cat, index) => {
        const state = sampleSceneCat(cat, elapsed);
        const option = options[index];
        const scale = (cat.scale ?? .45) * sceneScale;
        const node = nodes[index], sprite = sprites[index];
        node.style.left = `${left + state.x * 1862 * sceneScale}px`;
        node.style.top = `${top + state.y * 845 * sceneScale}px`;
        node.style.width = `${192 * scale}px`;
        node.style.height = `${208 * scale}px`;
        // NPCs render below the player's interaction layer and never take input.
        node.style.zIndex = String(Math.round(state.y * 10));
        let row = 0, frame = 0;
        if (cat.pose === 'stand') {
          const cell = STANDING_CELLS[cat.pet];
          row = Math.floor(cell / 3);
          frame = cell % 3;
        } else if (state.walking) {
          row = state.direction > 0 ? 1 : 2;
          frame = Math.floor(elapsed * 8 + index * 2) % 8;
        } else {
          // Hold a relaxed pose; the existing idle frames supply the blink.
          const blink = (elapsed + index * .7) % 5;
          frame = blink > 4.5 ? Math.min(Math.floor((blink - 4.5) * 8), option.idleFrames - 1) : 0;
        }
        sprite.style.backgroundPosition = `${-192 * frame}px ${-208 * row}px`;
        sprite.style.transform = `scale(${scale})`;
        node.dataset.motion = state.walking ? (state.direction > 0 ? 'right' : 'left') : cat.pose;
      });
      raf = requestAnimationFrame(tick);
    };
    tick(previous);
    return () => { cancelAnimationFrame(raf); observer.disconnect(); };
  }, [room, cats, spriteSheets]);

  if (!cats.length) return null;
  return (
    <div ref={layerRef} className="pet-scene-cats" aria-hidden="true">
      {cats.map(cat => (
        <div key={cat.id} data-scene-cat={cat.id} data-cat-kind={cat.pet}
          data-cat-pose={cat.pose} className={`pet-scene-cat pet-scene-cat-${cat.pose}`}>
          <div className="pet-scene-cat-shadow" />
          <div className="pet-scene-cat-sprite" style={{
            backgroundImage: `url(${cat.pose === 'stand' ? standingCatsUrl : getPetOption(cat.pet, spriteSheets).spriteSheetUrl})`,
          }} />
        </div>
      ))}
    </div>
  );
}
