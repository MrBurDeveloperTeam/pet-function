import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const fishingSource = readFileSync(new URL('../src/pet/internal/components/FishingGame.tsx', import.meta.url), 'utf8');
const roomSource = readFileSync(new URL('../src/pet/internal/PetRoom.tsx', import.meta.url), 'utf8');
const outlineSource = readFileSync(new URL('../src/pet/internal/components/RoomInteractionOutlines.tsx', import.meta.url), 'utf8');
const runtimeSource = readFileSync(new URL('../src/pet/runtime/SharedPetRuntime.tsx', import.meta.url), 'utf8');
const constantsSource = readFileSync(new URL('../src/pet/internal/constants.ts', import.meta.url), 'utf8');

test('town pond contour opens the dedicated fishing scene by click or nearby Space', () => {
  assert.match(outlineSource, /action: 'fishing', label: 'Go fishing from the wooden dock'/);
  assert.match(roomSource, /destination: RoomType\.FISHING_POND/);
  assert.match(roomSource, /isNearFishingDock/);
  assert.match(roomSource, /action === 'fishing'/);
});

test('leaving the fishing pond starts the shared room loading animation immediately', () => {
  assert.match(roomSource, /currentRoom === RoomType\.FISHING_POND[\s\S]*?setRoomTransition\(exit\);[\s\S]*?setLoadingAnimationKey\(\(key\) => key \+ 1\);[\s\S]*?setIsRoomTransitionLoading\(true\);[\s\S]*?return;/);
});

test('fishing power meter uses the requested difficulty and coin bands', () => {
  assert.match(fishingSource, /Math\.random\(\) >= 0\.6/);
  assert.match(fishingSource, /randomInt\(2, 5\)/);
  assert.match(fishingSource, /randomInt\(6, 10\)/);
  assert.match(fishingSource, /randomInt\(10, 20\)/);
  assert.match(fishingSource, /event\.code !== 'Space'/);
  assert.match(fishingSource, /M20 105 A110 78/);
});

test('fishing waits for a bite and uses discrete colour matches to reel to zero distance', () => {
  assert.match(fishingSource, /randomInt\(2000, 10000\)/);
  assert.match(fishingSource, /type FishingPhase = 'ready' \| 'waiting' \| 'power' \| 'reeling' \| 'result'/);
  assert.match(fishingSource, /phaseRef\.current === 'ready'.*castLine\(\)/);
  assert.match(fishingSource, /Press Space to cast the line/);
  assert.match(fishingSource, /next <= 0/);
  assert.match(fishingSource, /next >= 100/);
  assert.match(fishingSource, /resolveRouletteBand\(reelPointer, rouletteSlices\)/);
  assert.match(fishingSource, /correct \? -15 : 5/);
});

test('fishing includes a persistent step-by-step highlighted tutorial', () => {
  assert.match(fishingSource, /FISHING_TUTORIAL_STEPS/);
  assert.match(fishingSource, /Cast the line/);
  assert.match(fishingSource, /Choose your power/);
  assert.match(fishingSource, /Follow the !!! signal/);
  assert.match(fishingSource, /Hit the matching colour/);
  assert.match(fishingSource, /Pull the fish closer/);
  assert.match(fishingSource, /Catch and collect/);
  assert.match(fishingSource, /Every attempt changes the !!! and reshuffles the roulette/);
  assert.match(fishingSource, /pet-function:fishing-tutorial-complete-v1/);
  assert.match(fishingSource, /role="dialog" aria-modal="true" aria-label="Fishing tutorial"/);
  assert.match(fishingSource, /Open fishing tutorial/);
  assert.match(fishingSource, /const displayPhase = tutorialPreviewPhase \|\| phase/);
  assert.match(fishingSource, /tutorialStep === 1 \? 50 : pointer/);
  assert.match(fishingSource, /tutorialStep === 3 \? 'orange' : tutorialStep === 4 \? 'green' : struggleState/);
  assert.match(fishingSource, /tutorialStep === 5 \? tutorialResult : result!/);
  assert.match(fishingSource, /right-3 top-32/);
  assert.match(fishingSource, /0_0_0_9999px_rgba\(23,37,24,\.75\)/);
  assert.doesNotMatch(fishingSource, /z-\[70\] bg-\[#172518\]\/75/);
});

test('reeling uses three fixed struggle states and a fast moving colour-match pointer', () => {
  assert.match(fishingSource, /type FishStruggleState = 'green' \| 'orange' \| 'red'/);
  assert.match(fishingSource, /const \[reelPointer, setReelPointer\] = useState\(0\)/);
  assert.match(fishingSource, /elapsed \* 0\.08568/);
  assert.match(fishingSource, /const advanceStruggle = useCallback/);
  assert.match(fishingSource, /setTimeout\(advanceStruggle, 3070\)/);
  assert.match(fishingSource, /3070/);
  assert.match(fishingSource, /landedBand === struggleState/);
  assert.match(fishingSource, /createRouletteSlices/);
  assert.match(fishingSource, /length: 3/);
  assert.match(fishingSource, /length: 7/);
  assert.match(fishingSource, /length: 8/);
  assert.match(fishingSource, /weight: 1\.33/);
  assert.match(fishingSource, /shuffled\[\(index \+ 1\) % shuffled\.length\]\.band === target/);
  assert.match(fishingSource, /randomStruggleState\(struggleStateRef\.current\)/);
  assert.match(fishingSource, /struggleStateRef\.current = next/);
  assert.match(fishingSource, /setStruggleCycle\(current => current \+ 1\)/);
  assert.match(fishingSource, /\}\);\r?\n    advanceStruggle\(\);/);
  assert.match(fishingSource, /MATCH!  -15m/);
  assert.match(fishingSource, /WRONG COLOUR  \+5m/);
  assert.match(fishingSource, /gameRef\.current\?\.animate/);
  assert.match(fishingSource, /fishingSuccessFlash/);
  assert.match(fishingSource, /fishingSuccessStar/);
  assert.match(fishingSource, /PERFECT MATCH!/);
  assert.match(fishingSource, /phaseRef\.current === 'reeling'\) judgeReel\(\)/);
  assert.doesNotMatch(fishingSource, /Hold Space to reel in/);
  assert.doesNotMatch(fishingSource, /fishing-tension-gradient/);
});

test('bite feedback includes pond ripples, centered bobber motion, and an alert over the cat', () => {
  assert.match(fishingSource, /className="fishing-ripples"/);
  assert.match(fishingSource, /fishing-ripple--one/);
  assert.match(fishingSource, /fishing-ripple--two/);
  assert.match(fishingSource, /conic-gradient\(from 0deg/);
  assert.match(fishingSource, /red: '#ff3045'/);
  assert.match(fishingSource, /orange: '#ff9d12'/);
  assert.match(fishingSource, /green: '#20dc68'/);
  assert.match(fishingSource, /Pixel fishing roulette/);
  assert.match(fishingSource, /#f6c45e/);
  assert.match(fishingSource, /Array\.from\(\{ length: 8 \}/);
  assert.match(fishingSource, /Fishing bobber and bait/);
  assert.match(fishingSource, /fishing-bobber__float/);
  assert.match(fishingSource, /fishing-bobber__bait/);
  assert.match(fishingSource, /fishingRippleLocal/);
  assert.match(fishingSource, /displayPhase === 'waiting' \? Math\.sin/);
  assert.match(fishingSource, /Math\.sin\(motionTime \/ 217\).*Math\.sin\(motionTime \/ 83\).*Math\.sin\(motionTime \/ 47\)/);
  assert.match(fishingSource, /top: `\$\{bobberVisualTop\}%`/);
  assert.match(fishingSource, /\$\{bobberLeft\} \$\{bobberVisualTop\}/);
  assert.match(fishingSource, /displayPhase === 'power' && <div className="absolute -left-7 -top-8/);
});

test('a successful catch grants coins and the selected feedable fish species', () => {
  assert.match(roomSource, /grantItem\(fishId, 1\)/);
  assert.match(roomSource, /addCoins\(coins\)/);
  assert.match(roomSource, /addXP\(xp\)/);
  assert.match(runtimeSource, /grantItem: \(itemId: string, quantity\?: number\) => void/);
  for (const fishId of ['pond_fish', 'perch', 'catfish', 'rainbow_trout', 'koi_fish', 'golden_fish']) {
    assert.match(constantsSource, new RegExp(`id: '${fishId}'`));
    assert.match(fishingSource, new RegExp(`${fishId}:`));
  }
  assert.match(fishingSource, /FISH_POOLS/);
  assert.match(fishingSource, /onCatch\(next\.fish\.id, next\.coins, next\.xp\)/);
  assert.match(fishingSource, /\+\$\{result\.xp\} XP/);
});

test('fishing scene renders a rear-facing cat and fishing rod on the lower dock', () => {
  assert.match(fishingSource, /FishingCatBack/);
  assert.match(fishingSource, /bobberTop = displayPhase === 'reeling' \|\| landing \? 62 - distance \* 0\.31 : 31/);
  assert.match(fishingSource, /rodTipLeft = 57 \+ sway \* 1\.8/);
  assert.match(fishingSource, /scaleX\(\$\{Math\.max\(0, Math\.min\(100, distance\)\) \/ 100\}\)/);
  assert.match(fishingSource, /right: '2%', left: 'auto', top: '50%'/);
  assert.match(fishingSource, /width: 'min\(270px, calc\(100% - 2rem\)\)'/);
  assert.match(fishingSource, /style=\{result\.caught \? \{ left: '50%', top: '10%'/);
  assert.match(fishingSource, /: \{ right: '2%', left: 'auto', top: '50%'/);
  assert.match(fishingSource, /conic-gradient\(from 0deg/);
  assert.match(fishingSource, /rotate\(\$\{pointer \* 3\.6\}deg\)/);
  assert.doesNotMatch(fishingSource, /fishing-ripple-core/);
  assert.match(fishingSource, /width: 'clamp\(210px, 29dvh, 300px\)'/);
  assert.match(fishingSource, /height: 'clamp\(248px, 35dvh, 355px\)'/);
  assert.match(fishingSource, /bottom: '5%'/);
  for (const petId of ['mallow', 'silverbelt', 'fastrat', 'gulu', 'munchkin', 'mochi']) {
    assert.match(fishingSource, new RegExp(`${petId}: '/pet-function/fishing/${petId}-fishing-back\\.png'`));
  }
  for (const rodId of ['beginner_rod', 'forest_rod', 'carbon_rod', 'crystal_rod', 'legendary_rod']) {
    assert.match(fishingSource, new RegExp(`${rodId}:`));
  }
  assert.match(fishingSource, /rarityBoost: 2\.2/);
  assert.match(fishingSource, /1 \+ fish\.rarity \* boost/);
  assert.match(fishingSource, /equippedRodId = 'beginner_rod'/);
  assert.match(fishingSource, /Selected cat sitting with its back to the screen and holding the equipped fishing rod/);
  assert.match(fishingSource, /z-10 h-\[150%\]/);
  assert.match(fishingSource, /z-20 h-full w-full/);
});
