import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react';
import { SCENE_CATS, type SceneCat } from '../sceneCats';
import type { RoomType } from '../types';
import { createNpcDialoguePicker, findNearbyNpc } from '../npcDialogue.mjs';

type Conversation = { room: RoomType; cat: SceneCat; text: string };

export function useNpcConversations({ room, roomRef, petRef, disabled, onStart }: {
  room: RoomType;
  roomRef: RefObject<HTMLDivElement | null>;
  petRef: RefObject<HTMLDivElement | null>;
  disabled: boolean;
  onStart: () => void;
}) {
  const cats = useMemo(() => SCENE_CATS[room] ?? [], [room]);
  const pickDialogue = useMemo(() => createNpcDialoguePicker(), []);
  const [savedConversation, setConversation] = useState<Conversation | null>(null);
  const [nearbyCatId, setNearbyCatId] = useState<string | null>(null);
  const conversation = !disabled && savedConversation?.room === room ? savedConversation : null;

  const close = useCallback(() => setConversation(null), []);
  const talk = useCallback((cat: SceneCat) => {
    if (disabled) return;
    const currentCat = cats.find(candidate => candidate.id === cat.id);
    if (!currentCat) return;
    onStart();
    // Entrance guides retain their authored lines, both overhead and in the panel.
    setConversation({ room, cat: currentCat, text: currentCat.dialogue ?? pickDialogue(currentCat.id).text });
  }, [cats, disabled, onStart, pickDialogue, room]);

  const findTarget = useCallback(() => {
    const root = roomRef.current, playerNode = petRef.current;
    if (!root || !playerNode) return null;
    const playerRect = playerNode.getBoundingClientRect();
    if (!playerRect.width || !playerRect.height) return null;
    const player = { x: playerRect.left + playerRect.width / 2, y: playerRect.top + playerRect.height / 2 };
    const positions: Record<string, { x: number; y: number }> = {};
    // Both NPCs and the player are read in viewport pixels. This also handles
    // object-fit cropping, moving NPCs and the mobile room camera's transform.
    root.querySelectorAll<HTMLElement>('[data-scene-cat]').forEach(node => {
      const rect = node.getBoundingClientRect();
      if (node.dataset.sceneCat && rect.width && rect.height) {
        positions[node.dataset.sceneCat] = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      }
    });
    const range = Math.max(88, Math.min(136, Math.hypot(playerRect.width, playerRect.height) * 1.3));
    const id = findNearbyNpc(positions, player, range);
    if (!id) return null;
    const npcDistance = Math.hypot(positions[id].x - player.x, positions[id].y - player.y);
    // Space at a ball/door still opens it when that object is closer than the
    // NPC. Standing beside the cat instead selects the conversation.
    for (const action of root.querySelectorAll<SVGElement | HTMLElement>('[data-pet-interaction-action]')) {
      const rect = action.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      if (Math.hypot(rect.left + rect.width / 2 - player.x, rect.top + rect.height / 2 - player.y) < npcDistance) return null;
    }
    return id;
  }, [petRef, roomRef]);

  useEffect(() => {
    setConversation(null);
    setNearbyCatId(null);
  }, [room, disabled]);

  useEffect(() => {
    if (disabled || conversation || !cats.length) {
      setNearbyCatId(null);
      return;
    }
    const update = () => setNearbyCatId(findTarget());
    update();
    const timer = window.setInterval(update, 180);
    return () => window.clearInterval(timer);
  }, [cats, conversation, disabled, findTarget]);

  useEffect(() => {
    if (disabled || !cats.length) return;
    const interact = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (conversation) {
        if (event.code === 'Space' || event.key === 'Escape') {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (event.repeat) return;
          close();
        } else if (['w', 'a', 's', 'd'].includes(event.key.toLowerCase()) || event.key.startsWith('Arrow')) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
        return;
      }
      if (event.code !== 'Space' || event.repeat || event.defaultPrevented) return;
      const focusedNpc = target?.closest<HTMLElement>('[data-scene-cat]')?.dataset.sceneCat;
      if (!focusedNpc && target?.closest('button, [role="button"], [data-pet-interaction-action]')) return;
      const id = focusedNpc ?? findTarget();
      const cat = cats.find(candidate => candidate.id === id);
      if (!cat) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      talk(cat);
    };
    // Capture before the existing room/game Space shortcuts to select one action.
    window.addEventListener('keydown', interact, true);
    return () => window.removeEventListener('keydown', interact, true);
  }, [cats, close, conversation, disabled, findTarget, talk]);

  return { conversation, nearbyCatId, talk, close };
}
