import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { PetId } from '../petOptions';

type FishingBand = 'white' | 'green' | 'orange' | 'red';
type FishingPhase = 'ready' | 'waiting' | 'power' | 'reeling' | 'result';
const FISHING_TUTORIAL_STORAGE_KEY = 'pet-function:fishing-tutorial-complete-v1';
const FISHING_TUTORIAL_STEPS = [
  { title: 'Cast the line', detail: 'Press Space or click the cast panel. Then wait until a fish bites and the ! appears.', target: 'cast' },
  { title: 'Choose your power', detail: 'When the pointer moves across the meter, press Space or click it. Orange and red zones can catch rarer fish.', target: 'control' },
  { title: 'Reel the fish closer', detail: 'Hold Space or hold the reel button to reduce Distance. Reach 0m to catch the fish.', target: 'control' },
  { title: 'Watch line tension', detail: 'Release Space when tension enters the red danger zone. Resume reeling after the tension falls.', target: 'control' },
  { title: 'Collect the reward', detail: 'A successful catch gives fish, coins and XP. Select Fish again to start another round.', target: 'result' },
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
  const [selectedBand, setSelectedBand] = useState<FishingBand>('white');
  const [distance, setDistance] = useState(72);
  const [tension, setTension] = useState(18);
  const [fishStruggle, setFishStruggle] = useState(85);
  const [holding, setHolding] = useState(false);
  const [result, setResult] = useState<FishingResult | null>(null);
  const [motionTime, setMotionTime] = useState(0);
  const [tutorialStep, setTutorialStep] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(FISHING_TUTORIAL_STORAGE_KEY) === 'true' ? null : 0;
  });
  const directionRef = useRef(1), previousTimeRef = useRef<number | null>(null), reelingStartRef = useRef(0), phaseRef = useRef<FishingPhase>('ready'), tensionRef = useRef(18);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { tensionRef.current = tension; }, [tension]);

  const closeTutorial = useCallback(() => {
    window.localStorage.setItem(FISHING_TUTORIAL_STORAGE_KEY, 'true');
    setTutorialStep(null);
  }, []);

  const prepareCast = useCallback(() => { setPhase('ready'); setResult(null); setHolding(false); setPointer(0); setDistance(72); setTension(18); setFishStruggle(85); previousTimeRef.current = null; }, []);
  const castLine = useCallback(() => { setPhase('waiting'); setResult(null); setHolding(false); setPointer(0); setDistance(72); setTension(18); setFishStruggle(85); previousTimeRef.current = null; }, []);
  useEffect(() => { if (phase !== 'waiting') return; const timer = window.setTimeout(() => setPhase('power'), randomInt(2000, 10000)); return () => clearTimeout(timer); }, [phase]);
  useEffect(() => {
    if (phase !== 'power') return; let frame = 0;
    const animate = (time: number) => { const previous = previousTimeRef.current ?? time; const elapsed = Math.min(32, time - previous); previousTimeRef.current = time;
      setPointer(current => { let next = current + directionRef.current * elapsed * 0.075; if (next >= 100) { next = 100; directionRef.current = -1; } if (next <= 0) { next = 0; directionRef.current = 1; } return next; }); frame = requestAnimationFrame(animate); };
    frame = requestAnimationFrame(animate); return () => cancelAnimationFrame(frame);
  }, [phase]);
  useEffect(() => { let frame = 0; const animate = (time: number) => { setMotionTime(time); frame = requestAnimationFrame(animate); }; frame = requestAnimationFrame(animate); return () => cancelAnimationFrame(frame); }, []);

  const finishCatch = useCallback((band: FishingBand) => { const next = rollResult(band, equippedRodId); setResult(next); setPhase('result'); setHolding(false); if (next.caught && next.fish) onCatch(next.fish.id, next.coins, next.xp); }, [equippedRodId, onCatch]);
  useEffect(() => {
    if (phase !== 'reeling') return; let frame = 0, lastTime = performance.now();
    const animate = (time: number) => { const elapsed = Math.min(0.05, (time - lastTime) / 1000); lastTime = time;
      const strongDuration = selectedBand === 'red' ? 6.5 : selectedBand === 'orange' ? 5 : selectedBand === 'green' ? 4 : 3;
      const weakeningEnd = strongDuration + 3;
      const struggleCycle = ((time - reelingStartRef.current) / 1000) % (strongDuration + 7);
      const struggleStrength = struggleCycle < strongDuration
        ? 88 + Math.sin(time / 190) * 12
        : struggleCycle < weakeningEnd
          ? 88 - (struggleCycle - strongDuration) * 23
          : 19 + Math.sin(time / 430) * 6;
      const boundedStruggle = Math.max(10, Math.min(100, struggleStrength));
      setFishStruggle(boundedStruggle);
      const tensionRate = holding
        ? 12 + boundedStruggle * 0.32
        : -(42 + (100 - boundedStruggle) * 0.32);
      const nextTension = Math.max(0, Math.min(100, tensionRef.current + tensionRate * elapsed));
      tensionRef.current = nextTension;
      setTension(nextTension);
      if (nextTension >= 98) {
        setResult({ caught: false, coins: 0, xp: 0, band: selectedBand, fish: null });
        setPhase('result');
        setHolding(false);
        return;
      }
      setDistance(current => {
        const lowTensionEscapeBoost = !holding && boundedStruggle >= 70
          ? nextTension < 50 ? 2.1 : nextTension < 60 ? 1.65 : 1
          : 1;
        const rate = holding
          ? -(1 + (100 - boundedStruggle) * 0.18)
          : (4 + boundedStruggle * 0.06) * lowTensionEscapeBoost;
        const next = current + rate * elapsed;
        if (next <= 0) { setTimeout(() => finishCatch(selectedBand), 0); return 0; }
        if (next >= 100) { setTimeout(() => { setResult({ caught: false, coins: 0, xp: 0, band: selectedBand, fish: null }); setPhase('result'); setHolding(false); }, 0); return 100; }
        return next; }); frame = requestAnimationFrame(animate); };
    frame = requestAnimationFrame(animate); return () => cancelAnimationFrame(frame);
  }, [finishCatch, holding, phase, selectedBand]);

  const selectPower = useCallback(() => { if (phase !== 'power') return; const band = resolveBand(pointer); setSelectedBand(band); setDistance(62 + Math.abs(pointer - 50) * 0.45); setTension(66); tensionRef.current = 66; setFishStruggle(85); setHolding(false); previousTimeRef.current = null; reelingStartRef.current = performance.now(); setPhase('reeling'); }, [phase, pointer]);
  useEffect(() => {
    const editable = (event: KeyboardEvent) => Boolean((event.target instanceof HTMLElement ? event.target : null)?.closest('input,textarea,select,[contenteditable="true"]'));
    const down = (event: KeyboardEvent) => { if (event.code !== 'Space' || editable(event)) return; if (tutorialStep !== null) { event.preventDefault(); event.stopImmediatePropagation(); return; } event.preventDefault(); event.stopImmediatePropagation(); if (phaseRef.current === 'ready' && !event.repeat) castLine(); else if (phaseRef.current === 'power' && !event.repeat) selectPower(); else if (phaseRef.current === 'reeling') setHolding(true); else if (phaseRef.current === 'result' && !event.repeat) prepareCast(); };
    const up = (event: KeyboardEvent) => { if (event.code === 'Space') setHolding(false); };
    window.addEventListener('keydown', down, true); window.addEventListener('keyup', up, true); return () => { window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); };
  }, [castLine, prepareCast, selectPower, tutorialStep]);

  const movementStruggle = Math.sin(motionTime / 217) * 0.52 + Math.sin(motionTime / 83) * 0.31 + Math.sin(motionTime / 47) * 0.17;
  const tutorialPreviewPhase: FishingPhase | null = tutorialStep === null
    ? null
    : tutorialStep === 1
      ? 'power'
      : tutorialStep === 2 || tutorialStep === 3
        ? 'reeling'
        : tutorialStep === 4
          ? 'result'
          : 'ready';
  const displayPhase = tutorialPreviewPhase || phase;
  const tutorialResult: FishingResult = { caught: true, coins: 8, xp: 10, band: 'orange', fish: FISH_SPECIES.rainbow_trout };
  const struggleScale = 0.35 + fishStruggle / 100 * 0.65;
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
  return <div className="absolute inset-0 z-20 overflow-hidden" data-pet-movement-block>
    <style>{`
      @keyframes fishingRippleLocal { 0% { opacity:.95; transform:scale(.34) } 72% { opacity:.14 } 100% { opacity:0; transform:scale(1) } }
      @keyframes fishingBaitLocal { 0%,100% { transform:translateX(-50%) rotate(-9deg) } 50% { transform:translateX(-50%) rotate(11deg) } }
    `}</style>
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
    {displayPhase !== 'ready' && <svg className="pointer-events-none absolute inset-0 z-[15] h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d={`M ${rodTipLeft} ${rodTipTop} Q ${55 + sway * 4} 52 ${bobberLeft} ${bobberVisualTop}`} fill="none" stroke="#4b3825" strokeWidth="0.09" opacity="0.9" /></svg>}
    <div
      className="absolute bottom-0 left-1/2 z-30 -translate-x-1/2"
      style={{ width: 'clamp(210px, 29dvh, 300px)', height: 'clamp(248px, 35dvh, 355px)', bottom: '5%' }}
      aria-hidden="true"
    >{displayPhase === 'power' && <div className="absolute -left-7 -top-8 z-40 animate-bounce text-5xl font-black text-[#fff6c9] [filter:drop-shadow(3px_3px_0_#5a2f1b)]">!</div>}<FishingCatBack petId={petId} rodId={equippedRodId} sway={sway} landing={landing} /></div>
    {displayPhase === 'ready' && <Notice title="Ready to cast" detail="Press Space to cast the line" />}
    {displayPhase === 'waiting' && <Notice title="Waiting for a fish..." detail="Watch the bobber and wait for the !" />}
    {displayPhase === 'power' && <PowerMeter pointer={tutorialStep === 1 ? 50 : pointer} onSelect={tutorialStep === null ? selectPower : () => {}} />}
    {displayPhase === 'reeling' && <ReelMeter distance={tutorialStep === 2 ? 42 : distance} tension={tutorialStep === 3 ? 84 : 48} fishStruggle={tutorialStep === 3 ? 88 : 46} holding={tutorialStep === 2} onHolding={tutorialStep === null ? setHolding : () => {}} />}
    {displayPhase === 'result' && (tutorialStep === 4 || result) && <ResultCard result={tutorialStep === 4 ? tutorialResult : result!} onAgain={tutorialStep === null ? prepareCast : () => {}} />}
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
const ReelMeter = ({ distance, tension, fishStruggle, holding, onHolding }: { distance: number; tension: number; fishStruggle: number; holding: boolean; onHolding: (value: boolean) => void }) => {
  const danger = tension >= 72;
  const struggleLabel = fishStruggle >= 70 ? 'Strong' : fishStruggle >= 38 ? 'Weakening' : 'Tired';
  return <section className="absolute z-40 border-4 border-[#5a3a22] bg-[#fff3bd]/95 p-3 text-[#51341f] shadow-[6px_6px_0_rgba(49,32,20,0.55)]" style={{ right: '2%', left: 'auto', top: '50%', width: 'min(270px, calc(100% - 2rem))', transform: 'translateY(-50%)' }} aria-label="Fishing distance and line tension control">
    <div className="mb-2 flex items-end justify-between gap-3"><div><div className="text-sm font-black uppercase tracking-[0.12em]">Hold Space to reel in</div><div className={`text-[10px] font-black ${danger ? 'animate-pulse text-[#c72f2a]' : ''}`}>{danger ? 'LINE MAY SNAP — RELEASE SPACE!' : 'Release briefly, but the fish will pull away'}</div></div><strong className="text-lg">{Math.ceil(distance)}m</strong></div>
    <div className="mb-1 flex items-center justify-between text-[9px] font-black uppercase"><span>Distance</span><span>0m to catch</span></div>
    <div className="relative h-4 overflow-hidden border-2 border-[#51341f] bg-[#e7f1f2]"><div className={`absolute inset-0 origin-left ${distance > 82 ? 'bg-[#e94a3f]' : distance > 45 ? 'bg-[#f5a33b]' : 'bg-[#63c76a]'}`} style={{ transform: `scaleX(${Math.max(0, Math.min(100, distance)) / 100})`, willChange: 'transform' }}/></div>
    <div className="mb-1 mt-2 flex items-center justify-between text-[9px] font-black uppercase"><span>Fish struggle</span><span>{struggleLabel}</span></div>
    <div className="relative h-3 overflow-hidden border-2 border-[#51341f] bg-[#e7f1f2]"><div className={`absolute inset-0 origin-left ${fishStruggle >= 70 ? 'bg-[#e94a3f]' : fishStruggle >= 38 ? 'bg-[#f5a33b]' : 'bg-[#63c76a]'}`} style={{ transform: `scaleX(${fishStruggle / 100})`, willChange: 'transform' }}/></div>
    <div className="mb-1 mt-2 flex items-center justify-between text-[9px] font-black uppercase"><span>Line tension</span><span>{danger ? 'Danger' : holding ? 'Rising' : 'Recovering'}</span></div>
    <div className="mx-auto h-[66px] w-[190px]" aria-label={`Line tension ${Math.round(tension)} percent`}>
      <svg viewBox="0 0 200 76" className="h-full w-full overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id="fishing-tension-gradient" x1="0" x2="1">
            <stop offset="0%" stopColor="#63c76a"/><stop offset="50%" stopColor="#63c76a"/>
            <stop offset="50%" stopColor="#f5a33b"/><stop offset="72%" stopColor="#f5a33b"/>
            <stop offset="72%" stopColor="#e94a3f"/><stop offset="100%" stopColor="#e94a3f"/>
          </linearGradient>
        </defs>
        <path d="M14 68 A86 58 0 0 1 186 68" pathLength="100" fill="none" stroke="#51341f" strokeWidth="22"/>
        <path d="M14 68 A86 58 0 0 1 186 68" pathLength="100" fill="none" stroke="url(#fishing-tension-gradient)" strokeWidth="15"/>
        <g style={{ transform: `rotate(${tension * 1.8 - 90}deg)`, transformOrigin: '100px 68px', willChange: 'transform' }}>
          <path d="M100 68 L100 20" stroke="#352218" strokeWidth="4" strokeLinecap="round"/>
        </g>
        <circle cx="100" cy="68" r="8" fill="#fff3bd" stroke="#352218" strokeWidth="4"/>
      </svg>
    </div>
    <button type="button" onPointerDown={() => onHolding(true)} onPointerUp={() => onHolding(false)} onPointerLeave={() => onHolding(false)} className={`mt-2 w-full border-2 border-[#5a3a22] px-3 py-2 text-xs font-black uppercase shadow-[3px_3px_0_#5a3a22] ${danger ? 'bg-[#e94a3f] text-white' : holding ? 'translate-x-0.5 translate-y-0.5 bg-[#63c76a] shadow-none' : 'bg-[#f6a83b]'}`}>{danger ? 'Release now!' : holding ? 'Reeling...' : 'Hold here or Space'}</button>
  </section>;
};
const ResultCard = ({ result, onAgain }: { result: FishingResult; onAgain: () => void }) => <section className="absolute z-40 flex items-center justify-between gap-3 border-4 border-[#5a3a22] bg-[#fff3bd]/95 p-3 text-[#51341f] shadow-[6px_6px_0_rgba(49,32,20,0.55)]" style={result.caught ? { left: '50%', top: '10%', width: 'min(440px, calc(100% - 2rem))', transform: 'translateX(-50%)' } : { right: '2%', left: 'auto', top: '50%', width: 'min(270px, calc(100% - 2rem))', transform: 'translateY(-50%)' }} role="status" aria-live="polite"><div className="flex items-center gap-3">{result.caught && result.fish ? <img src={result.fish.image} alt={result.fish.label} className="h-14 w-14 object-contain [image-rendering:pixelated]"/> : <span className="text-4xl">💧</span>}<div><div className="text-sm font-black">{result.caught && result.fish ? `Caught a ${result.fish.label}! +${result.coins} coins · +${result.xp} XP` : 'The fish got away!'}</div><div className="text-[9px] font-black uppercase tracking-[0.1em] text-[#8a5c35]">{result.caught ? 'Fish added to Food inventory' : 'Keep the distance below 100m'}</div></div></div><button type="button" onClick={onAgain} className="shrink-0 border-2 border-[#5a3a22] bg-[#f6a83b] px-3 py-2 text-[10px] font-black uppercase shadow-[3px_3px_0_#5a3a22]">Fish again</button></section>;
