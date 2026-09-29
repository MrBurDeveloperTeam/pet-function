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

test('fishing waits for a bite and then requires the fish to be reeled to zero distance', () => {
  assert.match(fishingSource, /randomInt\(2000, 10000\)/);
  assert.match(fishingSource, /type FishingPhase = 'ready' \| 'waiting' \| 'power' \| 'reeling' \| 'result'/);
  assert.match(fishingSource, /phaseRef\.current === 'ready'.*castLine\(\)/);
  assert.match(fishingSource, /Press Space to cast the line/);
  assert.match(fishingSource, /next <= 0/);
  assert.match(fishingSource, /next >= 100/);
  assert.match(fishingSource, /setHolding\(true\)/);
  assert.match(fishingSource, /Hold Space to reel in/);
});

test('fishing includes a persistent step-by-step highlighted tutorial', () => {
  assert.match(fishingSource, /FISHING_TUTORIAL_STEPS/);
  assert.match(fishingSource, /Cast the line/);
  assert.match(fishingSource, /Choose your power/);
  assert.match(fishingSource, /Reel the fish closer/);
  assert.match(fishingSource, /Watch line tension/);
  assert.match(fishingSource, /Collect the reward/);
  assert.match(fishingSource, /pet-function:fishing-tutorial-complete-v1/);
  assert.match(fishingSource, /role="dialog" aria-modal="true" aria-label="Fishing tutorial"/);
  assert.match(fishingSource, /Open fishing tutorial/);
  assert.match(fishingSource, /const displayPhase = tutorialPreviewPhase \|\| phase/);
  assert.match(fishingSource, /tutorialStep === 1 \? 50 : pointer/);
  assert.match(fishingSource, /tutorialStep === 3 \? 84 : 48/);
  assert.match(fishingSource, /tutorialStep === 4 \? tutorialResult : result!/);
  assert.match(fishingSource, /right-3 top-32/);
  assert.match(fishingSource, /0_0_0_9999px_rgba\(23,37,24,\.75\)/);
  assert.doesNotMatch(fishingSource, /z-\[70\] bg-\[#172518\]\/75/);
});

test('continuous reeling builds tension and requires the player to release Space', () => {
  assert.match(fishingSource, /const \[tension, setTension\] = useState\(18\)/);
  assert.match(fishingSource, /const danger = tension >= 72/);
  assert.match(fishingSource, /const \[fishStruggle, setFishStruggle\] = useState\(85\)/);
  assert.match(fishingSource, /selectedBand === 'red' \? 6\.5 : selectedBand === 'orange' \? 5 : selectedBand === 'green' \? 4 : 3/);
  assert.match(fishingSource, /struggleCycle = \(\(time - reelingStartRef\.current\) \/ 1000\) % \(strongDuration \+ 7\)/);
  assert.match(fishingSource, /reelingStartRef\.current = performance\.now\(\)/);
  assert.match(fishingSource, /struggleCycle < strongDuration/);
  assert.match(fishingSource, /struggleCycle < weakeningEnd/);
  assert.match(fishingSource, /12 \+ boundedStruggle \* 0\.32/);
  assert.match(fishingSource, /42 \+ \(100 - boundedStruggle\) \* 0\.32/);
  assert.match(fishingSource, /nextTension >= 98/);
  assert.match(fishingSource, /\? -\(1 \+ \(100 - boundedStruggle\) \* 0\.18\)/);
  assert.match(fishingSource, /boundedStruggle >= 70/);
  assert.match(fishingSource, /nextTension < 50 \? 2\.1 : nextTension < 60 \? 1\.65 : 1/);
  assert.match(fishingSource, /\(4 \+ boundedStruggle \* 0\.06\) \* lowTensionEscapeBoost/);
  assert.match(fishingSource, /setTension\(66\); tensionRef\.current = 66/);
  assert.match(fishingSource, /Fish struggle/);
  assert.match(fishingSource, /'Strong'.*'Weakening'.*'Tired'/);
  assert.match(fishingSource, /LINE MAY SNAP — RELEASE SPACE!/);
  assert.match(fishingSource, /Release briefly, but the fish will pull away/);
  assert.match(fishingSource, /Line tension/);
  assert.match(fishingSource, /fishing-tension-gradient/);
  assert.match(fishingSource, /tension \* 1\.8 - 90/);
  assert.doesNotMatch(fishingSource, /transition: 'transform 100ms linear'/);
});

test('bite feedback includes pond ripples, centered bobber motion, and an alert over the cat', () => {
  assert.match(fishingSource, /className="fishing-ripples"/);
  assert.match(fishingSource, /fishing-ripple--one/);
  assert.match(fishingSource, /fishing-ripple--two/);
  assert.doesNotMatch(fishingSource, /strokeDasharray/);
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
  assert.match(fishingSource, /<stop offset="72%" stopColor="#e94a3f"/);
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
