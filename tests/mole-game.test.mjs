import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import test from 'node:test';

const gameSource = readFileSync(new URL('../src/pet/internal/components/MoleGame.tsx', import.meta.url), 'utf8');
const roomSource = readFileSync(new URL('../src/pet/internal/PetRoom.tsx', import.meta.url), 'utf8');

test('outside renders an interactive pixel mole den with click and nearby Space entry', () => {
  assert.match(gameSource, /export const PixelMoleMound/);
  assert.match(gameSource, /Enter the underground mole game/);
  assert.match(roomSource, /<PixelMoleMound onOpen=\{\(\) => setShowMoleGame\(true\)\}/);
  assert.match(roomSource, /const isNearMoleDen = petXRatio >= 0\.66/);
  assert.match(roomSource, /event\.code !== 'Space'/);
});

test('mole game embeds the shared Godot export and persists validated rewards', () => {
  assert.match(gameSource, /\/games\/mole-game\/index\.html/);
  assert.match(gameSource, /<iframe/);
  assert.match(gameSource, /event\.origin !== window\.location\.origin/);
  assert.match(gameSource, /event\.source !== frameRef\.current\?\.contentWindow/);
  assert.match(gameSource, /message\.source === MOLE_GAME_SOURCE/);
  assert.match(gameSource, /rewardedRef\.current/);
  assert.match(gameSource, /onReward\(coins, xp\)/);
  assert.match(roomSource, /addCoins\(coins\);[\s\S]*?addXP\(xp\);/);
  assert.match(gameSource, /right: '7\.25rem', top: '1\.5rem'/);
  assert.match(gameSource, /aria-label=\{`\$\{stats\.coins \|\| 0\} coins`\}/);
  assert.match(gameSource, /<MoleLevelBadge stats=\{stats\}/);
  assert.match(gameSource, /border: '4px solid #5a3a22'/);
  assert.match(gameSource, /boxShadow: '5px 5px 0 rgba\(53,35,20,\.55\)'/);
  assert.doesNotMatch(gameSource, /onExitPet|Exit pet page/);
  assert.doesNotMatch(gameSource, /aria-label="Open room map"/);
  assert.match(gameSource, /className="pet-interface overflow-hidden/);
});

test('mole game launcher declares the current exported pack size', () => {
  const exportedPage = readFileSync(new URL('../public/games/mole-game/index.html', import.meta.url), 'utf8');
  const packSize = statSync(new URL('../public/games/mole-game/index.pck', import.meta.url)).size;
  assert.match(exportedPage, new RegExp(`"index\\.pck\\?v=godot-v11":${packSize}`));
  assert.match(exportedPage, /"mainPack":"index\.pck\?v=godot-v11"/);
});

test('mole game provides a full-screen scene and loading state without a popup dialog', () => {
  assert.match(gameSource, /Underground mole game scene/);
  assert.match(gameSource, /loading-mine\.png/);
  assert.match(gameSource, /aria-label="Loading Mole Hunt"/);
  assert.match(gameSource, /event.data.type === 'game-progress'/);
  assert.match(gameSource, /position: 'fixed', inset: 0, zIndex: 2000/);
  assert.match(gameSource, /width: '100vw', height: '100dvh'/);
  assert.match(gameSource, /display: 'block', width: '100%', height: '100%'/);
  assert.match(gameSource, /createPortal\(/);
  assert.match(gameSource, /document\.body/);
  assert.doesNotMatch(gameSource, /aria-label="Underground mole game scene"[^>]*role=/);
});

test('opening the mole game pauses outside movement and Escape closes it', () => {
  assert.match(roomSource, /showShopModal \|\| showMoleGame \|\| isSleeping/);
  assert.match(roomSource, /event\.key !== 'Escape'/);
  assert.match(roomSource, /setShowMoleGame\(false\)/);
  assert.match(roomSource, /currentRoom === RoomType\.PLAYROOM && showMoleGame/);
});

test('Godot background fills wide screens while gameplay stays inside its safe area', () => {
  const project = readFileSync(new URL('../godot/mole-game/project.godot', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../godot/mole-game/scripts/main.gd', import.meta.url), 'utf8');
  assert.match(project, /window\/stretch\/aspect="expand"/);
  assert.match(script, /background_rect := Rect2\(-position, viewport_size\)/);
  assert.match(script, /draw_texture_rect\(MINE_BACKGROUND, background_rect, false\)/);
  assert.match(script, /position = \(viewport_size - VIEW\) \* 0\.5/);
  assert.doesNotMatch(script, /cover_scale/);
  assert.doesNotMatch(script, /A restrained foreground vignette/);
  assert.match(script, /scene_position := to_local\(event\.position\)/);
});

test('Godot targets use the polished pixel-art sprite set', () => {
  const script = readFileSync(new URL('../godot/mole-game/scripts/main.gd', import.meta.url), 'utf8');
  for (const asset of ['burrow-hole-v1.png', 'mole-v1.png', 'bomb-v1.png', 'kitten-v1.png', 'mole-boss-v1.png']) {
    assert.match(script, new RegExp(asset.replace('.', '\\.')));
  }
  assert.match(script, /draw_target_sprite/);
  assert.doesNotMatch(script, /draw_circle\(p, 40\*s, fur\)/);
});

test('Godot targets show distinct animated hit reactions before despawning', () => {
  const script = readFileSync(new URL('../godot/mole-game/scripts/main.gd', import.meta.url), 'utf8');
  for (const asset of ['mole-hit-v1.png', 'kitten-hit-v1.png', 'mole-boss-hit-v1.png', 'bomb-explosion-v1.png']) {
    assert.match(script, new RegExp(asset.replace('.', '\\.')));
  }
  assert.match(script, /reaction_hole = index/);
  assert.match(script, /draw_hit_reaction/);
  assert.match(script, /sin\(progress \* PI\)/);
  assert.match(script, /tint\.a = alpha/);
});

test('Mole King stays visible longer and has a larger click target', () => {
  const script = readFileSync(new URL('../godot/mole-game/scripts/main.gd', import.meta.url), 'utf8');
  assert.match(script, /func get_target_lifetime\(\) -> float:/);
  assert.match(script, /return 1\.30 if target_variant == "shield" else \(0\.82 if target_variant == "enraged" else 1\.05\)/);
  assert.match(script, /hitbox_boost := \(1\.40 if target_kind == "boss" else 1\.25\) if i == target_hole else 1\.0/);
});

test('every visible target has a forgiving hitbox and golden moles are removed', () => {
  const script = readFileSync(new URL('../godot/mole-game/scripts/main.gd', import.meta.url), 'utf8');
  assert.match(script, /else 1\.25\) if i == target_hole/);
  assert.match(script, /target_kind = "kitten" if roll < 0\.22 else \("bomb" if roll < 0\.38 else "mole"\)/);
  assert.doesNotMatch(script, /"gold"/);
});

test('advanced game loop includes tooth care, armor, boss phases, skill energy, blackout, and bonus rewards', () => {
  const script = readFileSync(new URL('../godot/mole-game/scripts/main.gd', import.meta.url), 'utf8');
  for (const asset of ['kitten-plaque-v1.png', 'kitten-cavity-v1.png', 'mole-armored-v1.png', 'mole-boss-shield-v1.png', 'mole-boss-enraged-v1.png']) {
    assert.match(script, new RegExp(asset.replace('.', '\\.')));
  }
  assert.match(script, /target_variant = "healthy"/);
  assert.match(script, /target_variant = "armored"/);
  assert.match(script, /target_variant = "phase1"/);
  assert.match(script, /func activate_skill/);
  assert.match(script, /skill_time = 3\.0/);
  assert.match(script, /func is_blackout_active/);
  assert.match(script, /BLACKOUT — FOLLOW THE GLOW/);
  assert.match(script, /var coins := floori\(score \/ 10\.0\) if boss_defeated else 0/);
  assert.match(script, /var xp := 20 if boss_defeated else 0/);
  assert.match(script, /"teethTreated": teeth_treated/);
});

test('blackout clues, random timing, time fracture spectacle, and enraged mud attack are state driven', () => {
  const script = readFileSync(new URL('../godot/mole-game/scripts/main.gd', import.meta.url), 'utf8');
  assert.match(script, /const ROUND_TIME := 45\.0/);
  assert.match(script, /next_blackout_at = time_left - rng\.randf_range\(10\.5, 15\.0\)/);
  assert.match(script, /blackout_time = rng\.randf_range\(3\.0, 4\.8\)/);
  assert.match(script, /func draw_authentic_eye_glow/);
  assert.match(script, /draw_texture_rect_region\(texture,eye_rect,eye_source/);
  assert.match(script, /target_variant == "enraged"/);
  assert.match(script, /func draw_skill_effect/);
  assert.match(script, /TIME FRACTURE/);
  assert.match(script, /func update_boss_mud/);
  assert.match(script, /mud_throw_time = 0\.46/);
  assert.match(script, /mud_time = 2\.0/);
  assert.match(script, /func draw_mud_splatter/);
});

test('boss battle freezes the clock, ends on defeat, and uses icon HUD plus a pixel result card', () => {
  const script = readFileSync(new URL('../godot/mole-game/scripts/main.gd', import.meta.url), 'utf8');
  assert.match(script, /boss_battle_active := time_left <= 10\.0 and boss_hp > 0/);
  assert.match(script, /skill_time <= 0\.0 and not boss_battle_active/);
  assert.match(script, /if boss_defeated:[\s\S]*?playing = false[\s\S]*?send_completion\(\)/);
  assert.match(script, /330 \* boss_hp \/ 6\.0/);
  assert.match(script, /func draw_status_icons/);
  assert.match(script, /func draw_pixel_heart/);
  assert.match(script, /func draw_pixel_star/);
  assert.match(script, /func draw_pixel_flame/);
  assert.match(script, /func draw_result_panel/);
  assert.match(script, /CAVERN CONQUERED/);
  assert.doesNotMatch(script, /SCORE %d    COMBO %d    HEARTS %d    TIME %02d/);
});

test('time freeze allows full target emergence and rewards only a boss victory', () => {
  const script = readFileSync(new URL('../godot/mole-game/scripts/main.gd', import.meta.url), 'utf8');
  assert.match(script, /target_age < 0\.16/);
  assert.match(script, /target_age = minf\(0\.16, target_age \+ delta\)/);
  assert.match(script, /target_age = maxf\(target_age, 0\.16\)/);
  assert.match(script, /result-panel-v1\.png/);
  assert.doesNotMatch(script, /draw_rect\(Rect2\(Vector2\.ZERO,VIEW\),Color\("090708"\),true\)/);
  assert.match(script, /var coins := floori\(score \/ 10\.0\) if boss_defeated else 0/);
  assert.match(script, /var xp := 20 if boss_defeated else 0/);
  assert.match(gameSource, /Math\.min\(9999/);
  assert.match(gameSource, /Math\.min\(20/);
});

test('charged catalyst flashes its border and places the Space key hint outside the meter', () => {
  const script = readFileSync(new URL('../godot/mole-game/scripts/main.gd', import.meta.url), 'utf8');
  assert.match(script, /var catalyst_ready := energy >= 100\.0/);
  assert.match(script, /ready_pulse := 0\.5\+0\.5\*sin/);
  assert.match(script, /Rect2\(1192,245,70,230\)/);
  assert.match(script, /energy_height := 128\.0 \* energy \/ 100\.0/);
  assert.match(script, /var hint_y := 337\.0\+ready_pulse\*2\.0/);
  assert.match(script, /"SPACE"/);
  assert.match(script, /"PRESS"/);
  assert.doesNotMatch(script, /"SPACE READY"/);
});

test('mole HUD anchors its scene return arrow to the upper-left viewport corner', () => {
  const script = readFileSync(new URL('../godot/mole-game/scripts/main.gd', import.meta.url), 'utf8');
  assert.match(script, /return Rect2\(Vector2\(24, 24\) - position, Vector2\(64, 64\)\)/);
  assert.match(script, /scene_exit_rect\(\)\.has_point\(to_local\(event\.position\)\)/);
  assert.doesNotMatch(script, /Rect2\(18,\s*331,\s*64,\s*64\)/);
  assert.doesNotMatch(script, /"<  OUTSIDE"/);
  assert.match(gameSource, /godot-v12/);
  assert.doesNotMatch(gameSource, /Entering the mine|animate-spin/);
  assert.match(roomSource, /stats=\{stats\}/);
});

test('mole game has a reusable spotlight tutorial tied to the real advanced mechanics', () => {
  const script = readFileSync(new URL('../godot/mole-game/scripts/main.gd', import.meta.url), 'utf8');
  const exportedPage = readFileSync(new URL('../public/games/mole-game/index.html', import.meta.url), 'utf8');
  assert.match(gameSource, /MOLE_TUTORIAL_STORAGE_KEY/);
  assert.match(gameSource, /MOLE_TUTORIAL_STEPS/);
  assert.match(gameSource, /Nine Burrows Training/);
  assert.match(gameSource, /Normal mole/);
  assert.match(gameSource, /Armored mole/);
  assert.match(gameSource, /CLICK 1 TIME/);
  assert.match(gameSource, /CLICK 2 TIMES/);
  assert.match(gameSource, /DO NOT CLICK/);
  assert.doesNotMatch(gameSource, /spotlight:\s*\{[^}]*height:\s*'\d+dvh'/);
  assert.match(gameSource, /type TutorialTargetBounds/);
  assert.match(gameSource, /projectTutorialTargetBounds/);
  assert.match(gameSource, /tutorialTargetViewportBoundsRef/);
  assert.match(gameSource, /frameRect\.left \+ bounds\.left \* scaleX/);
  assert.match(gameSource, /frameRect\.top \+ bounds\.top \* scaleY/);
  assert.match(gameSource, /window\.addEventListener\('resize', updateTutorialTargetBounds\)/);
  assert.match(gameSource, /tutorial-target-bounds/);
  assert.match(script, /"viewportWidth": viewport_size\.x/);
  assert.match(script, /"viewportHeight": viewport_size\.y/);
  assert.match(gameSource, /frameRect\.width \/ bounds\.viewportWidth/);
  assert.match(gameSource, /frameRect\.height \/ bounds\.viewportHeight/);
  assert.match(gameSource, /left: `\$\{targetBounds\.left\}px`/);
  assert.match(script, /func post_tutorial_target_bounds\(\)/);
  assert.match(script, /texture\.get_height\(\)/);
  assert.match(script, /get_target_base_width\(target_kind\) \* hole_scale/);
  assert.match(script, /call_deferred\("post_tutorial_target_bounds"\)/);
  assert.match(gameSource, /right: 'calc\(100% \+ \.8rem\)'/);
  assert.match(gameSource, /cardStyle = \{ right: '2\.5%', top: '13%' \}/);
  assert.match(gameSource, /0 0 0 9999px rgba\(6,4,3,\.86\)/);
  assert.match(gameSource, /▼ LOOK HERE ▼/);
  assert.match(gameSource, /background: '#fff1b8'/);
  assert.match(gameSource, /aria-label="Open mole game tutorial"/);
  assert.match(gameSource, /GUIDE/);
  assert.match(gameSource, /top: '7rem'/);
  assert.match(gameSource, /pointerEvents: 'auto'/);
  assert.match(gameSource, /type: 'tutorial-active' \| 'tutorial-complete' \| 'tutorial-step'/);
  assert.match(script, /var tutorial_paused := true/);
  assert.match(script, /post_to_host\("game-ready"\)/);
  assert.match(exportedPage, /notifyHost\('game-ready'\)/);
  assert.match(gameSource, /type: 'request-game-ready'/);
  assert.match(gameSource, /event\.data\.type === 'game-ready'[\s\S]*?setLoaded\(true\)/);
  assert.match(gameSource, /loaded && tutorialStep !== null/);
  assert.doesNotMatch(gameSource, /onLoad=\{\(\) => setLoaded\(true\)\}/);
  assert.match(script, /JavaScriptBridge\.create_callback\(_on_host_message\)/);
  assert.match(script, /data\.type == "tutorial-active"/);
  assert.match(script, /data\.type == "tutorial-complete"/);
  assert.match(script, /tutorial_paused = false\s+tutorial_step = -1\s+reset_game\(\)/);
  assert.match(script, /func setup_tutorial_step/);
  assert.match(script, /func hit_tutorial_target/);
  assert.match(script, /post_to_host\("tutorial-progress"/);
  assert.match(script, /tutorial_reaction_resume_hole/);
  assert.match(script, /tutorial_progress_pending/);
  assert.match(script, /if reaction_age >= 0\.48:[\s\S]*post_to_host\("tutorial-progress", \{"step": completed_step\}\)/);
  assert.match(script, /target_hole = -1[\s\S]*tutorial_progress_pending = tutorial_step/);
  assert.match(script, /shake = 0\.0\s+flash = 0\.0\s+particles\.clear\(\)/);
});
