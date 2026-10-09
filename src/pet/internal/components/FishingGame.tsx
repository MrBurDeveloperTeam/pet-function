import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PetId } from '../petOptions';

type FishingBand = 'white' | 'green' | 'orange' | 'red';
type FishStruggleState = 'green' | 'orange' | 'red';
interface RouletteSlice { band: FishStruggleState; size: number }
type FishingPhase = 'ready' | 'waiting' | 'power' | 'reeling' | 'result';
const FISHING_TUTORIAL_STORAGE_KEY = 'pet-function:fishing-tutorial-complete-v1';
const FISHING_TUTORIAL_STEPS = [
  { title: 'Cast the line', detail: 'Press Space or click to cast. Wait for the bobber to bite.', target: 'cast' },
  { title: 'Choose your power', detail: 'Stop the pointer on a colour. Orange and red power can hook rarer fish.', target: 'control' },
  { title: 'Follow the !!! signal', detail: 'Match the roulette to the green, orange or red !!! above the bobber. The matching colour has fewer, separated spaces.', target: 'control' },
  { title: 'Hit the matching colour', detail: 'Press Space or click on the matching colour. Every attempt changes the !!! and reshuffles the roulette.', target: 'control' },
  { title: 'Pull the fish closer', detail: 'A correct hit flashes gold stars and pulls the fish 15m closer. A miss lets it escape 5m farther.', target: 'control' },
  { title: 'Catch and collect', detail: 'Reach 0m to catch the fish and collect fish, coins and XP.', target: 'result' },
] as const;
export type FishingRodId = 'beginner_rod' | 'forest_rod' | 'carbon_rod' | 'crystal_rod' | 'legendary_rod';
interface FishingSpecies { id: string; label: string; image: string; rarity: number }
interface FishingResult { caught: boolean; coins: number; xp: number; band: FishingBand; fish: FishingSpecies | null }
interface FishingGameProps { petId: PetId; equippedRodId?: FishingRodId; onCatch: (fishId: string, coins: number, xp: number) => void }

export const FISHING_RODS: Record<FishingRodId, { id: FishingRodId; label: string; image: string; rarityBoost: number }> = {
  beginner_rod: { id: 'beginner_rod', label: 'Beginner Rod', image: '/pet-function/fishing/beginner-fishing-rod.png', rarityBoost: 0 },
  forest_rod: { id: 'forest_rod', label: 'Forest Rod', image: '/pet-function/fishing/forest-fishing-rod.png', rarityBoost: 0.45 },
  carbon_rod: { id: 'carbon_rod', label: 'Carbon Rod', image: '/pet-function/fishing/carbon-fishing-rod.png', rarityBoost: 0.9 },
  crystal_rod: { id: 'crystal_rod', label: 'Crystal Rod', image: '/pet-function/fishing/crystal-fishing-rod.png', rarityBoost: 1.45 },
  legendary_rod: { id: 'legendary_rod', label: 'Legendary Rod', image: '/pet-function/fishing/legendary-fishing-rod.png', rarityBoost: 2.2 },
};

const FISH_SPECIES: Record<string, FishingSpecies> = {
  pond_fish: { id: 'pond_fish', label: 'Pond Fish', image: '/pet-function/items/pond-fish-pixel.png', rarity: 0 },
  perch: { id: 'perch', label: 'Perch', image: '/pet-function/items/perch-pixel.png', rarity: 0 },
  catfish: { id: 'catfish', label: 'Catfish', image: '/pet-function/items/catfish-pixel.png', rarity: 1 },
  rainbow_trout: { id: 'rainbow_trout', label: 'Rainbow Trout', image: '/pet-function/items/rainbow-trout-pixel.png', rarity: 2 },
  koi_fish: { id: 'koi_fish', label: 'Koi Fish', image: '/pet-function/items/koi-fish-pixel.png', rarity: 3 },
  golden_fish: { id: 'golden_fish', label: 'Golden Fish', image: '/pet-function/items/golden-fish-pixel.png', rarity: 4 },
};
const FISH_POOLS: Record<FishingBand, FishingSpecies[]> = {
  white: [FISH_SPECIES.pond_fish, FISH_SPECIES.perch],
  green: [FISH_SPECIES.pond_fish, FISH_SPECIES.perch, FISH_SPECIES.catfish],
  orange: [FISH_SPECIES.rainbow_trout, FISH_SPECIES.koi_fish],
  red: [FISH_SPECIES.koi_fish, FISH_SPECIES.golden_fish],
};
const FISHING_BANDS: { band: FishingBand; start: number; end: number }[] = [
  { band: 'white', start: 0, end: 20 }, { band: 'green', start: 20, end: 34 },
  { band: 'orange', start: 34, end: 44 }, { band: 'red', start: 44, end: 56 },
  { band: 'orange', start: 56, end: 66 }, { band: 'green', start: 66, end: 80 },
  { band: 'white', start: 80, end: 100 },
];
const FISHING_CAT_BACK_IMAGES: Record<PetId, string> = {
  mallow: '/pet-function/fishing/mallow-fishing-back.png', silverbelt: '/pet-function/fishing/silverbelt-fishing-back.png',
  fastrat: '/pet-function/fishing/fastrat-fishing-back.png', gulu: '/pet-function/fishing/gulu-fishing-back.png',
  munchkin: '/pet-function/fishing/munchkin-fishing-back.png', mochi: '/pet-function/fishing/mochi-fishing-back.png',
};
const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const randomFish = (band: FishingBand, rodId: FishingRodId) => {
  const pool = FISH_POOLS[band];
  const boost = FISHING_RODS[rodId].rarityBoost;
  const weights = pool.map(fish => 1 + fish.rarity * boost);
  let roll = Math.random() * weights.reduce((total, weight) => total + weight, 0);
  for (let index = 0; index < pool.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) return pool[index];
  }
  return pool[pool.length - 1];
};
const resolveBand = (value: number) => FISHING_BANDS.find(({ start, end }) => value >= start && value < end)?.band || 'white';
const randomStruggleState = (avoid?: FishStruggleState): FishStruggleState => {
  const states: FishStruggleState[] = ['green', 'orange', 'red'];
  const choices = avoid ? states.filter(state => state !== avoid) : states;
  return choices[randomInt(0, choices.length - 1)];
};
const createRouletteSlices = (target: FishStruggleState, avoid?: RouletteSlice[]): RouletteSlice[] => {
  const others = (['green', 'orange', 'red'] as FishStruggleState[]).filter(band => band !== target);
  const raw = [
    ...Array.from({ length: 3 }, () => ({ band: target, weight: 1.33 })),
    ...Array.from({ length: 7 }, () => ({ band: others[0], weight: 1 })),
    ...Array.from({ length: 8 }, () => ({ band: others[1], weight: 1 })),
  ];
  let shuffled = raw;
  do {
    shuffled = raw.map(slice => ({ ...slice }));
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = randomInt(0, index);
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
  } while (
    shuffled.some((slice, index) => slice.band === target && shuffled[(index + 1) % shuffled.length].band === target)
    || (avoid && shuffled.every((slice, index) => slice.band === avoid[index]?.band))
  );
  const totalWeight = shuffled.reduce((total, slice) => total + slice.weight, 0);
  return shuffled.map(slice => ({ band: slice.band, size: slice.weight / totalWeight * 100 }));
};
const resolveRouletteBand = (value: number, slices: RouletteSlice[]) => {
  let boundary = 0;
  return slices.find(slice => { boundary += slice.size; return value < boundary; })?.band || slices[slices.length - 1].band;
};
const rouletteSliceCenter = (slices: RouletteSlice[], band: FishStruggleState) => {
  let boundary = 0;
  for (const slice of slices) { const start = boundary; boundary += slice.size; if (slice.band === band) return start + slice.size / 2; }
  return 0;
};
const rouletteGradient = (slices: RouletteSlice[]) => {
  let boundary = 0;
  const colours: Record<FishStruggleState, string> = { red: '#ff3045', orange: '#ff9d12', green: '#20dc68' };
  return slices.map(slice => { const start = boundary; boundary += slice.size; const colourEnd = Math.max(start, boundary - 0.42); return `${colours[slice.band]} ${start}% ${colourEnd}%, #5b301c ${colourEnd}% ${boundary}%`; }).join(', ');
};
const rollResult = (band: FishingBand, rodId: FishingRodId): FishingResult => {
  if (band === 'white') { const caught = Math.random() >= 0.6; return { band, caught, coins: caught ? randomInt(1, 2) : 0, xp: caught ? randomInt(2, 3) : 0, fish: caught ? randomFish(band, rodId) : null }; }
  if (band === 'green') return { band, caught: true, coins: randomInt(2, 5), xp: randomInt(4, 6), fish: randomFish(band, rodId) };
  if (band === 'orange') return { band, caught: true, coins: randomInt(6, 10), xp: randomInt(8, 12), fish: randomFish(band, rodId) };
  return { band, caught: true, coins: randomInt(10, 20), xp: randomInt(14, 20), fish: randomFish(band, rodId) };
};

const FishingCatBack = ({ petId, rodId, sway, landing }: { petId: PetId; rodId: FishingRodId; sway: number; landing: boolean }) => <div className="relative h-full w-full" aria-label="Selected cat sitting with its back to the screen and holding the equipped fishing rod">
  <img src={FISHING_RODS[rodId].image} alt="" draggable={false} className="absolute -right-[38%] -top-[42%] z-10 h-[150%] w-[150%] origin-[45%_82%] select-none object-contain [image-rendering:pixelated]" style={{ transform: `rotate(${landing ? -18 : sway * 8}deg)`, willChange: 'transform' }} />
  <img src={FISHING_CAT_BACK_IMAGES[petId]} alt="" draggable={false} className="absolute inset-0 z-20 h-full w-full select-none object-contain [image-rendering:pixelated]" />
</div>;

export const FishingGame: React.FC<FishingGameProps> = ({ petId, equippedRodId = 'beginner_rod', onCatch }) => {
  const [phase, setPhase] = useState<FishingPhase>('ready');
  const [pointer, setPointer] = useState(0);
  const [reelPointer, setReelPointer] = useState(0);
  const [struggleState, setStruggleState] = useState<FishStruggleState>('orange');
  const struggleStateRef = useRef<FishStruggleState>('orange');
  const [rouletteSlices, setRouletteSlices] = useState<RouletteSlice[]>(() => createRouletteSlices('orange'));
  const [struggleCycle, setStruggleCycle] = useState(0);
  const [reelFeedback, setReelFeedback] = useState<{ id: number; correct: boolean; text: string } | null>(null);
  const [selectedBand, setSelectedBand] = useState<FishingBand>('white');
  const [distance, setDistance] = useState(72);
  const [result, setResult] = useState<FishingResult | null>(null);
  const [motionTime, setMotionTime] = useState(0);
  const gameRef = useRef<HTMLDivElement>(null);
  const [tutorialStep, setTutorialStep] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(FISHING_TUTORIAL_STORAGE_KEY) === 'true' ? null : 0;
  });
  const directionRef = useRef(1), reelDirectionRef = useRef(1), previousTimeRef = useRef<number | null>(null), reelPreviousTimeRef = useRef<number | null>(null), phaseRef = useRef<FishingPhase>('ready');
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const closeTutorial = useCallback(() => {
    window.localStorage.setItem(FISHING_TUTORIAL_STORAGE_KEY, 'true');
    setTutorialStep(null);
  }, []);

  const resetReel = useCallback(() => { const nextStruggle = randomStruggleState(); struggleStateRef.current = nextStruggle; setReelPointer(0); setStruggleState(nextStruggle); setRouletteSlices(createRouletteSlices(nextStruggle)); setReelFeedback(null); reelDirectionRef.current = 1; reelPreviousTimeRef.current = null; }, []);
  const prepareCast = useCallback(() => { setPhase('ready'); setResult(null); setPointer(0); setDistance(70); resetReel(); previousTimeRef.current = null; }, [resetReel]);
  const castLine = useCallback(() => { setPhase('waiting'); setResult(null); setPointer(0); setDistance(70); resetReel(); previousTimeRef.current = null; }, [resetReel]);
  useEffect(() => { if (phase !== 'waiting') return; const timer = window.setTimeout(() => setPhase('power'), randomInt(2000, 10000)); return () => clearTimeout(timer); }, [phase]);
  useEffect(() => {
    if (phase !== 'power') return; let frame = 0;
    const animate = (time: number) => { const previous = previousTimeRef.current ?? time; const elapsed = Math.min(32, time - previous); previousTimeRef.current = time;
      setPointer(current => { let next = current + directionRef.current * elapsed * 0.075; if (next >= 100) { next = 100; directionRef.current = -1; } if (next <= 0) { next = 0; directionRef.current = 1; } return next; }); frame = requestAnimationFrame(animate); };
    frame = requestAnimationFrame(animate); return () => cancelAnimationFrame(frame);
  }, [phase]);
  useEffect(() => { let frame = 0; const animate = (time: number) => { setMotionTime(time); frame = requestAnimationFrame(animate); }; frame = requestAnimationFrame(animate); return () => cancelAnimationFrame(frame); }, []);

  const finishCatch = useCallback((band: FishingBand) => { const next = rollResult(band, equippedRodId); setResult(next); setPhase('result'); if (next.caught && next.fish) onCatch(next.fish.id, next.coins, next.xp); }, [equippedRodId, onCatch]);
  useEffect(() => {
    if (phase !== 'reeling') return; let frame = 0;
    const animate = (time: number) => { const previous = reelPreviousTimeRef.current ?? time; const elapsed = Math.min(32, time - previous); reelPreviousTimeRef.current = time;
      setReelPointer(current => { const next = current + reelDirectionRef.current * elapsed * 0.08568; return next >= 100 ? next - 100 : next; }); frame = requestAnimationFrame(animate); };
    frame = requestAnimationFrame(animate); return () => cancelAnimationFrame(frame);
  }, [phase]);
  const advanceStruggle = useCallback(() => {
    const next = randomStruggleState(struggleStateRef.current);
    struggleStateRef.current = next;
    setStruggleState(next);
    setRouletteSlices(slices => createRouletteSlices(next, slices));
    setStruggleCycle(current => current + 1);
  }, []);
  useEffect(() => { if (phase !== 'reeling') return; const timer = window.setTimeout(advanceStruggle, 3070); return () => clearTimeout(timer); }, [advanceStruggle, phase, struggleCycle]);

  const selectPower = useCallback(() => { if (phase !== 'power') return; const band = resolveBand(pointer); setSelectedBand(band); setDistance(Math.round((60 + Math.abs(pointer - 50) * 0.4) / 5) * 5); resetReel(); previousTimeRef.current = null; setPhase('reeling'); }, [phase, pointer, resetReel]);
  const judgeReel = useCallback(() => {
    if (phaseRef.current !== 'reeling') return;
    const landedBand = resolveRouletteBand(reelPointer, rouletteSlices);
    const correct = landedBand === struggleState;
    const distanceChange = correct ? -15 : 5;
    setReelFeedback({ id: Date.now(), correct, text: correct ? 'MATCH!  -15m' : 'WRONG COLOUR  +5m' });
    if (correct) gameRef.current?.animate([
      { transform: 'translate(0, 0)' },
      { transform: 'translate(-10px, 4px)' },
      { transform: 'translate(9px, -5px)' },
      { transform: 'translate(-7px, -3px)' },
      { transform: 'translate(6px, 3px)' },
      { transform: 'translate(-3px, 1px)' },
      { transform: 'translate(0, 0)' },
    ], { duration: 460, easing: 'cubic-bezier(.2,.8,.2,1)' });
    setDistance(current => {
      const next = Math.max(0, Math.min(100, current + distanceChange));
      if (next <= 0) setTimeout(() => finishCatch(selectedBand), 0);
      if (next >= 100) setTimeout(() => { setResult({ caught: false, coins: 0, xp: 0, band: selectedBand, fish: null }); setPhase('result'); }, 0);
      return next;
    });
    advanceStruggle();
  }, [advanceStruggle, finishCatch, reelPointer, rouletteSlices, selectedBand, struggleState]);
  useEffect(() => {
    const editable = (event: KeyboardEvent) => Boolean((event.target instanceof HTMLElement ? event.target : null)?.closest('input,textarea,select,[contenteditable="true"]'));
    const down = (event: KeyboardEvent) => { if (event.code !== 'Space' || editable(event)) return; if (tutorialStep !== null) { event.preventDefault(); event.stopImmediatePropagation(); return; } event.preventDefault(); event.stopImmediatePropagation(); if (event.repeat) return; if (phaseRef.current === 'ready') castLine(); else if (phaseRef.current === 'power') selectPower(); else if (phaseRef.current === 'reeling') judgeReel(); else if (phaseRef.current === 'result') prepareCast(); };
    window.addEventListener('keydown', down, true); return () => window.removeEventListener('keydown', down, true);
  }, [castLine, judgeReel, prepareCast, selectPower, tutorialStep]);

  const movementStruggle = Math.sin(motionTime / 217) * 0.52 + Math.sin(motionTime / 83) * 0.31 + Math.sin(motionTime / 47) * 0.17;
  const tutorialPreviewPhase: FishingPhase | null = tutorialStep === null
    ? null
    : tutorialStep === 1
      ? 'power'
      : tutorialStep === 2 || tutorialStep === 3 || tutorialStep === 4
        ? 'reeling'
        : tutorialStep === 5
          ? 'result'
          : 'ready';
  const displayPhase = tutorialPreviewPhase || phase;
  const tutorialResult: FishingResult = { caught: true, coins: 8, xp: 10, band: 'orange', fish: FISH_SPECIES.rainbow_trout };
  const displayStruggleState: FishStruggleState = tutorialStep === 2 ? 'red' : tutorialStep === 3 ? 'orange' : tutorialStep === 4 ? 'green' : struggleState;
  const struggleScale = displayStruggleState === 'red' ? 1 : displayStruggleState === 'orange' ? 0.68 : 0.38;
  const sway = displayPhase === 'reeling' ? movementStruggle * struggleScale * Math.min(1, distance / 28) : 0;
  const idleBob = displayPhase === 'waiting' ? Math.sin(motionTime / 360) * 0.35 : 0;
  const hookedBob = displayPhase === 'power' ? Math.sin(motionTime / 91) * 0.7 + Math.sin(motionTime / 43) * 0.25 : 0;
  const reelBob = displayPhase === 'reeling' ? (Math.sin(motionTime / 137) * 0.48 + Math.sin(motionTime / 59) * 0.22) * Math.min(1, distance / 25) : 0;
  const landing = displayPhase === 'result' && Boolean((tutorialStep === 4 ? tutorialResult : result)?.caught);
  const bobberLeft = 50 + sway * 11;
  // Cast deep into the pond. During reeling,
  // the shared bobber/ripple/line endpoint travels continuously back to shore.
  const bobberTop = displayPhase === 'reeling' || landing ? 62 - distance * 0.31 : 31;
  const bobberVisualTop = bobberTop + idleBob + hookedBob + reelBob;
  const rodTipLeft = 57 + sway * 1.8;
  const rodTipTop = 66 - Math.abs(sway) * 0.7;
  return <div ref={gameRef} className="absolute inset-0 z-20 overflow-hidden" data-pet-movement-block>
    <style>{`
      @keyframes fishingRippleLocal { 0% { opacity:.95; transform:scale(.34) } 72% { opacity:.14 } 100% { opacity:0; transform:scale(1) } }
      @keyframes fishingBaitLocal { 0%,100% { transform:translateX(-50%) rotate(-9deg) } 50% { transform:translateX(-50%) rotate(11deg) } }
      @keyframes fishingSuccessFlash { 0% { opacity:0 } 18% { opacity:.9 } 100% { opacity:0 } }
      @keyframes fishingSuccessTitle { 0% { opacity:0; transform:translate(-50%,-50%) scale(.35) rotate(-5deg) } 28% { opacity:1; transform:translate(-50%,-50%) scale(1.28) rotate(3deg) } 58% { opacity:1; transform:translate(-50%,-50%) scale(1) rotate(0) } 100% { opacity:0; transform:translate(-50%,-70%) scale(1.08) } }
      @keyframes fishingSuccessStar { 0% { opacity:0; transform:translate(-50%,-50%) rotate(0deg) scale(.2) } 24% { opacity:1 } 100% { opacity:0; transform:translate(calc(-50% + var(--star-x)),calc(-50% + var(--star-y))) rotate(220deg) scale(1.35) } }
    `}</style>
    {reelFeedback?.correct && <div key={reelFeedback.id} className="pointer-events-none absolute inset-0 z-[58] overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 border-[10px] border-[#fff2a0] bg-[radial-gradient(circle_at_center,rgba(255,246,169,.42),transparent_58%)] shadow-[inset_0_0_80px_18px_rgba(255,205,42,.75)]" style={{ animation: 'fishingSuccessFlash 760ms ease-out both' }} />
      <div className="absolute left-1/2 top-[42%] whitespace-nowrap text-center text-[clamp(25px,4vw,54px)] font-black tracking-[0.08em] text-[#fff6a8] [text-shadow:4px_4px_0_#7b3d19,0_0_10px_#ffdf48,0_0_24px_#ff9f1c]" style={{ animation: 'fishingSuccessTitle 900ms ease-out both' }}>★ PERFECT MATCH! ★</div>
      {[
        ['-260px', '-150px'], ['-190px', '90px'], ['-100px', '-220px'], ['80px', '-210px'],
        ['190px', '-105px'], ['255px', '55px'], ['130px', '175px'], ['-120px', '185px'],
      ].map(([x, y], index) => <span key={index} className="absolute left-1/2 top-[43%] text-[clamp(22px,3vw,42px)] text-[#fff47a] [filter:drop-shadow(3px_3px_0_#a5521e)_drop-shadow(0_0_8px_#fff)]" style={{ '--star-x': x, '--star-y': y, animation: `fishingSuccessStar 820ms ${index * 35}ms ease-out both` } as React.CSSProperties}>★</span>)}
    </div>}
    {displayPhase !== 'ready' && <div className="fishing-ripples" style={{ position: 'absolute', zIndex: 20, left: `${bobberLeft}%`, top: `${bobberVisualTop}%`, width: 'clamp(90px, 10vw, 150px)', height: 'clamp(32px, 3.8vw, 56px)', pointerEvents: 'none', transform: 'translate(-50%, -50%)' }} aria-hidden="true">
      <span className="fishing-ripple fishing-ripple--one" style={{ position: 'absolute', inset: 0, border: '3px solid rgba(236,255,255,.95)', borderRadius: '50%', transformOrigin: 'center', animation: 'fishingRippleLocal 2.2s ease-out infinite' }} />
      <span className="fishing-ripple fishing-ripple--two" style={{ position: 'absolute', inset: 0, border: '3px solid rgba(255,255,255,.9)', borderRadius: '50%', transformOrigin: 'center', animation: 'fishingRippleLocal 2.2s 1.1s ease-out infinite' }} />
    </div>}
    {displayPhase !== 'ready' && <div className="fishing-bobber" style={{ position: 'absolute', zIndex: 26, left: `${bobberLeft}%`, top: `${bobberVisualTop}%`, width: 24, height: 52, pointerEvents: 'none', filter: 'drop-shadow(2px 3px 0 rgba(42,27,17,.45))', transform: 'translate(-50%, -50%)' }} aria-label="Fishing bobber and bait">
      <span className="fishing-bobber__antenna" style={{ position: 'absolute', top: 0, left: '50%', width: 5, height: 14, border: '1px solid #3e281a', background: '#fff3ae', transform: 'translateX(-50%)' }} />
      <span className="fishing-bobber__float" style={{ position: 'absolute', top: 11, left: '50%', width: 21, height: 21, overflow: 'hidden', border: '3px solid #4a2c1d', borderRadius: '50%', background: 'linear-gradient(to bottom,#fff5cf 0 48%,#ef493d 49% 100%)', transform: 'translateX(-50%)' }} />
      <span className="fishing-bobber__hook-line" style={{ position: 'absolute', top: 31, left: '50%', width: 2, height: 13, background: '#3d3026', transform: 'translateX(-50%)' }} />
      <span className="fishing-bobber__bait" style={{ position: 'absolute', top: 42, left: '50%', width: 10, height: 8, border: '2px solid #70401f', borderRadius: '55% 45%', background: '#f3b842', transformOrigin: 'top center', animation: 'fishingBaitLocal 680ms ease-in-out infinite' }} />
    </div>}
    {displayPhase === 'reeling' && <div className="absolute z-[29] -translate-x-1/2 -translate-y-full select-none text-center font-black tracking-[0.08em]" style={{ left: `${bobberLeft}%`, top: `calc(${bobberVisualTop}% - 31px)`, color: displayStruggleState === 'red' ? '#ff3f35' : displayStruggleState === 'orange' ? '#ff9f2f' : '#63dc74', fontSize: 'clamp(28px, 3vw, 46px)', textShadow: '3px 3px 0 #4a2818, 0 0 12px currentColor', animation: 'fishingBaitLocal 420ms ease-in-out infinite' }} aria-label={`${displayStruggleState} fish struggle`}>!!!</div>}
    {displayPhase !== 'ready' && <svg className="pointer-events-none absolute inset-0 z-[15] h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d={`M ${rodTipLeft} ${rodTipTop} Q ${55 + sway * 4} 52 ${bobberLeft} ${bobberVisualTop}`} fill="none" stroke="#4b3825" strokeWidth="0.09" opacity="0.9" /></svg>}
    <div
      className="absolute bottom-0 left-1/2 z-30 -translate-x-1/2"
      style={{ width: 'clamp(210px, 29dvh, 300px)', height: 'clamp(248px, 35dvh, 355px)', bottom: '5%' }}
      aria-hidden="true"
    >{displayPhase === 'power' && <div className="absolute -left-7 -top-8 z-40 animate-bounce text-5xl font-black text-[#fff6c9] [filter:drop-shadow(3px_3px_0_#5a2f1b)]">!</div>}<FishingCatBack petId={petId} rodId={equippedRodId} sway={sway} landing={landing} /></div>
    {displayPhase === 'ready' && <Notice title="Ready to cast" detail="Press Space to cast the line" />}
    {displayPhase === 'waiting' && <Notice title="Waiting for a fish..." detail="Watch the bobber and wait for the !" />}
    {displayPhase === 'power' && <PowerMeter pointer={tutorialStep === 1 ? 50 : pointer} onSelect={tutorialStep === null ? selectPower : () => {}} />}
    {displayPhase === 'reeling' && <ReelMeter distance={tutorialStep === 2 || tutorialStep === 3 || tutorialStep === 4 ? 45 : distance} pointer={tutorialStep === 3 ? rouletteSliceCenter(rouletteSlices, 'orange') : tutorialStep === 4 ? rouletteSliceCenter(rouletteSlices, 'green') : reelPointer} rouletteSlices={rouletteSlices} struggleState={displayStruggleState} feedback={tutorialStep === 4 ? { id: 0, correct: true, text: 'MATCH!  -15m' } : tutorialStep === null ? reelFeedback : null} onJudge={tutorialStep === null ? judgeReel : () => {}} />}
    {displayPhase === 'result' && (tutorialStep === 5 || result) && <ResultCard result={tutorialStep === 5 ? tutorialResult : result!} onAgain={tutorialStep === null ? prepareCast : () => {}} preview={tutorialStep === 5} />}
    <button type="button" onClick={() => setTutorialStep(0)} className="absolute right-3 top-32 z-[65] flex h-10 w-10 items-center justify-center border-4 border-[#5a3a22] bg-[#fff3bd] text-lg font-black text-[#51341f] shadow-[3px_3px_0_#5a3a22]" aria-label="Open fishing tutorial">?</button>
    {tutorialStep !== null && (
      <FishingTutorial
        step={tutorialStep}
        onBack={() => setTutorialStep(current => current === null ? 0 : Math.max(0, current - 1))}
        onNext={() => tutorialStep === FISHING_TUTORIAL_STEPS.length - 1 ? closeTutorial() : setTutorialStep(tutorialStep + 1)}
        onSkip={closeTutorial}
      />
    )}
  </div>;
};

const FishingTutorial = ({ step, onBack, onNext, onSkip }: { step: number; onBack: () => void; onNext: () => void; onSkip: () => void }) => {
  const item = FISHING_TUTORIAL_STEPS[step];
  const highlightClass = item.target === 'cast'
    ? 'bottom-[4%] left-1/2 h-[42%] w-[34%] -translate-x-1/2'
    : item.target === 'result'
      ? 'left-1/2 top-[7%] h-[22%] w-[48%] -translate-x-1/2'
      : 'right-[1%] top-1/2 h-[48%] w-[min(290px,40%)] -translate-y-1/2';
  return <div className="absolute inset-0 z-[70] overflow-hidden" role="dialog" aria-modal="true" aria-label="Fishing tutorial">
    <div className={`pointer-events-none absolute border-4 border-[#ffe45c] shadow-[0_0_0_4px_#5a3a22,0_0_0_9999px_rgba(23,37,24,.75),0_0_24px_8px_rgba(255,228,92,.8)] ${highlightClass}`} aria-hidden="true" />
    <section className="absolute left-1/2 top-1/2 w-[min(390px,calc(100%_-_2rem))] -translate-x-1/2 -translate-y-1/2 border-4 border-[#5a3a22] bg-[#fff3bd] p-4 text-[#51341f] shadow-[7px_7px_0_rgba(40,25,15,.72)]">
      <div className="mb-3 flex items-center justify-between gap-3 border-b-4 border-dashed border-[#c0843d] pb-2">
        <strong className="text-xs font-black uppercase tracking-[0.13em]">Fishing tutorial</strong>
        <span className="border-2 border-[#5a3a22] bg-[#f6a83b] px-2 py-1 text-[10px] font-black">{step + 1} / {FISHING_TUTORIAL_STEPS.length}</span>
      </div>
      <h2 className="text-lg font-black uppercase">{item.title}</h2>
      <p className="mt-2 text-sm font-bold leading-6">{item.detail}</p>
      <div className="mt-4 flex items-center justify-between gap-2">
        <button type="button" onClick={onSkip} className="px-2 py-2 text-[10px] font-black uppercase underline">Skip tutorial</button>
        <div className="flex gap-2">
          <button type="button" onClick={onBack} disabled={step === 0} className="border-2 border-[#5a3a22] bg-[#fff8dc] px-3 py-2 text-[10px] font-black uppercase disabled:opacity-40">Back</button>
          <button type="button" onClick={onNext} className="border-2 border-[#5a3a22] bg-[#f6a83b] px-4 py-2 text-[10px] font-black uppercase shadow-[3px_3px_0_#5a3a22]">{step === FISHING_TUTORIAL_STEPS.length - 1 ? 'Start fishing' : 'Next'}</button>
        </div>
      </div>
    </section>
  </div>;
};

const Notice = ({ title, detail }: { title: string; detail: string }) => <div className="absolute z-30 border-4 border-[#5a3a22] bg-[#fff3bd]/95 px-5 py-3 text-center text-[#51341f] shadow-[5px_5px_0_rgba(49,32,20,0.5)]" style={{ right: '2%', left: 'auto', top: '50%', width: 'min(270px, calc(100% - 2rem))', transform: 'translateY(-50%)' }} role="status"><div className="text-sm font-black uppercase tracking-[0.12em]">{title}</div><div className="text-[10px] font-bold">{detail}</div></div>;
const PowerMeter = ({ pointer, onSelect }: { pointer: number; onSelect: () => void }) => <section className="absolute z-40 text-center" style={{ right: '2%', left: 'auto', top: '50%', width: 'min(270px, calc(100% - 2rem))', transform: 'translateY(-50%)' }} aria-label="Fishing power selector"><div className="mb-1 text-sm font-black uppercase tracking-[0.14em] text-[#fff8d0] [text-shadow:2px_2px_0_#4a2d1b]">Choose power</div><button type="button" onClick={onSelect} className="relative h-[112px] w-full focus-visible:outline focus-visible:outline-4 focus-visible:outline-[#fff4bd]" aria-label="Stop fishing power pointer"><svg viewBox="0 0 260 118" className="h-full w-full overflow-visible drop-shadow-[4px_5px_0_rgba(55,31,18,0.55)]" aria-hidden="true"><defs><linearGradient id="fishing-power-gradient"><stop offset="0%" stopColor="#f8f4e8"/><stop offset="20%" stopColor="#f8f4e8"/><stop offset="20%" stopColor="#63c76a"/><stop offset="34%" stopColor="#63c76a"/><stop offset="34%" stopColor="#f5a33b"/><stop offset="44%" stopColor="#f5a33b"/><stop offset="44%" stopColor="#e94a3f"/><stop offset="56%" stopColor="#e94a3f"/><stop offset="56%" stopColor="#f5a33b"/><stop offset="66%" stopColor="#f5a33b"/><stop offset="66%" stopColor="#63c76a"/><stop offset="80%" stopColor="#63c76a"/><stop offset="80%" stopColor="#f8f4e8"/><stop offset="100%" stopColor="#f8f4e8"/></linearGradient></defs><path d="M20 105 A110 78 0 0 1 240 105" pathLength="100" fill="none" stroke="#56371f" strokeWidth="28"/><path d="M20 105 A110 78 0 0 1 240 105" pathLength="100" fill="none" stroke="url(#fishing-power-gradient)" strokeWidth="20"/><g style={{ transform: `rotate(${pointer * 1.8 - 90}deg)`, transformOrigin: '130px 105px' }}><path d="M130 105 L130 28" stroke="#392419" strokeWidth="5" strokeLinecap="round"/><circle cx="130" cy="105" r="9" fill="#fff3bd" stroke="#392419" strokeWidth="4"/></g></svg></button><div className="-mt-1 border-2 border-[#5a3a22] bg-[#fff3bd]/95 px-3 py-2 text-[10px] font-black text-[#51341f] shadow-[3px_3px_0_#5a3a22]">CLICK OR PRESS SPACE</div></section>;
const ReelMeter = ({ distance, pointer, rouletteSlices, struggleState, feedback, onJudge }: { distance: number; pointer: number; rouletteSlices: RouletteSlice[]; struggleState: FishStruggleState; feedback: { id: number; correct: boolean; text: string } | null; onJudge: () => void }) => {
  const struggleLabel = struggleState === 'red' ? 'Very strong' : struggleState === 'orange' ? 'Strong' : 'Weak';
  return <section className="absolute z-40 border-4 border-[#5a3a22] bg-[#fff3bd]/95 p-3 text-[#51341f] shadow-[6px_6px_0_rgba(49,32,20,0.55)]" style={{ right: '2%', left: 'auto', top: '50%', width: 'min(290px, calc(100% - 2rem))', transform: 'translateY(-50%)' }} aria-label="Fishing colour match control">
    <div className="mb-2 flex items-end justify-between gap-3"><div><div className="text-sm font-black uppercase tracking-[0.12em]">Match the struggle colour</div><div className="text-[10px] font-black">Match = -15m · miss = +5m</div></div><strong className="text-lg">{Math.ceil(distance)}m</strong></div>
    <div className="mb-1 flex items-center justify-between text-[9px] font-black uppercase"><span>Distance</span><span>0m to catch</span></div>
    <div className="relative h-4 overflow-hidden border-2 border-[#51341f] bg-[#e7f1f2]"><div className={`absolute inset-0 origin-left ${distance > 82 ? 'bg-[#e94a3f]' : distance > 45 ? 'bg-[#f5a33b]' : 'bg-[#63c76a]'}`} style={{ transform: `scaleX(${Math.max(0, Math.min(100, distance)) / 100})`, willChange: 'transform' }}/></div>
    <div className="mb-1 mt-2 flex items-center justify-between text-[9px] font-black uppercase"><span>Bobber signal</span><span style={{ color: struggleState === 'red' ? '#c72f2a' : struggleState === 'orange' ? '#c86a1b' : '#26873e' }}>{struggleLabel} !!!</span></div>
    <div className="relative mx-auto my-3 h-[222px] w-[222px]" aria-label="Pixel fishing roulette">
      <span className="pointer-events-none absolute inset-0 rounded-full border-[7px] border-[#4b2819] bg-[#a86129] shadow-[0_5px_0_#2d1a12,0_0_0_4px_#f6c45e,0_0_0_8px_#6c381f]" aria-hidden="true" />
      <span className="pointer-events-none absolute inset-[7px] rounded-full border-[5px] border-[#ffd879] shadow-[inset_0_0_0_4px_#8e4a25,inset_0_0_18px_rgba(42,20,10,.72)]" aria-hidden="true" />
      <button type="button" onClick={onJudge} className="absolute inset-[13px] rounded-full border-[5px] border-[#512918] shadow-[inset_0_0_0_3px_rgba(255,232,158,.35),4px_5px_0_rgba(55,31,18,0.48)] focus-visible:outline focus-visible:outline-4 focus-visible:outline-[#ffe45c]" aria-label={`Press when the pointer reaches ${struggleState}`} style={{ background: `conic-gradient(from 0deg, ${rouletteGradient(rouletteSlices)})` }}>
        <span className="absolute inset-[30%] rounded-full border-[5px] border-[#4b2819] bg-[radial-gradient(circle_at_38%_32%,#fff4b8_0_18%,#f3bd55_45%,#a65a28_100%)] shadow-[0_0_0_4px_#ffd978,inset_0_0_0_4px_#d98d38,3px_4px_0_rgba(50,25,14,.55)]" aria-hidden="true" />
        <span className="absolute left-1/2 top-1/2 h-[46%] w-[9px] origin-[50%_100%] rounded-t-full border-x-2 border-[#3d2116] bg-gradient-to-r from-[#b86a2c] via-[#fff0a4] to-[#8f451f] shadow-[2px_1px_0_rgba(42,22,14,.55)]" style={{ transform: `translate(-50%, -100%) rotate(${pointer * 3.6}deg)`, willChange: 'transform' }} aria-hidden="true">
          <span className="absolute -top-[7px] left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-l-2 border-t-2 border-[#3d2116] bg-[#ffe082]" />
        </span>
        <span className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-[5px] border-[#402217] bg-[#fff0a2] shadow-[inset_0_0_0_3px_#d58431,2px_3px_0_rgba(44,22,12,.5)]" aria-hidden="true" />
      </button>
      {Array.from({ length: 8 }, (_, index) => <span key={index} className="pointer-events-none absolute left-1/2 top-1/2 h-[7px] w-[7px] rounded-sm border border-[#5a2d19] bg-[#ffe28a] shadow-[1px_1px_0_#8a451f]" style={{ transform: `translate(-50%, -50%) rotate(${index * 45}deg) translateY(-103px)` }} aria-hidden="true" />)}
    </div>
    <div key={feedback?.id ?? 'ready'} className={`mt-1 min-h-5 text-center text-xs font-black uppercase ${feedback ? (feedback.correct ? 'text-[#26873e]' : 'text-[#c72f2a]') : 'text-[#8a5c35]'}`}>{feedback?.text ?? 'Click meter or press Space'}</div>
  </section>;
};
const CaughtFishReveal = ({ fish, onDismiss, preview }: { fish: FishingSpecies; onDismiss: () => void; preview: boolean }) => {
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (preview) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    buttonRef.current?.focus({ preventScroll: true });
    return () => { if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); };
  }, [preview]);
  const reveal = <button
    ref={buttonRef}
    type="button"
    className="fishing-catch-reveal"
    style={{ position: preview ? 'absolute' : 'fixed', inset: 0, zIndex: preview ? 60 : 2147483647, width: '100%', height: '100%', padding: 0, border: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: 'rgba(3, 12, 18, .86)', cursor: 'pointer', touchAction: 'manipulation' }}
    aria-label={`Caught a ${fish.label}. Click anywhere or press Space to close.`}
    onClick={event => { event.stopPropagation(); onDismiss(); }}
  >
    <style>{`
      @keyframes fishingCatchReveal { from { opacity: 0; transform: scale(.08) } to { opacity: 1; transform: scale(1) } }
      .fishing-catch-reveal img { animation: fishingCatchReveal 1100ms cubic-bezier(.16,.65,.25,1) both; }
      @media (prefers-reduced-motion: reduce) { .fishing-catch-reveal img { animation: none; } }
    `}</style>
    <img src={fish.image} alt={fish.label} draggable={false} style={{ width: '96%', height: '94%', objectFit: 'contain', imageRendering: 'pixelated', pointerEvents: 'none', userSelect: 'none', filter: 'drop-shadow(0 12px 28px rgba(0,0,0,.65))' }} />
  </button>;
  return preview ? reveal : createPortal(reveal, document.body);
};

const ResultCard = ({ result, onAgain, preview = false }: { result: FishingResult; onAgain: () => void; preview?: boolean }) => {
  if (result.caught && result.fish) return <CaughtFishReveal fish={result.fish} onDismiss={onAgain} preview={preview} />;
  return <section className="absolute z-40 flex items-center justify-between gap-3 border-4 border-[#5a3a22] bg-[#fff3bd]/95 p-3 text-[#51341f] shadow-[6px_6px_0_rgba(49,32,20,0.55)]" style={{ right: '2%', top: '50%', width: 'min(270px, calc(100% - 2rem))', transform: 'translateY(-50%)' }} role="status" aria-live="polite">
    <div className="flex items-center gap-3"><span className="text-4xl">💧</span><div><div className="text-sm font-black">The fish got away!</div><div className="text-[9px] font-black uppercase tracking-[0.1em] text-[#8a5c35]">Keep the distance below 100m</div></div></div>
    <button type="button" onClick={onAgain} className="shrink-0 border-2 border-[#5a3a22] bg-[#f6a83b] px-3 py-2 text-[10px] font-black uppercase shadow-[3px_3px_0_#5a3a22]">Fish again</button>
  </section>;
};
