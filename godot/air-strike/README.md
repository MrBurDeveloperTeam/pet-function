# Sky Patrol — Godot arcade shooter

Godot 4.7.2 handles drawing, input, collision, projectiles, audio, talents and campaign logic. main.gd owns combat/rendering, progression.gd owns skills, campaign.gd owns chapters, waves, abilities, hazards, bosses and Endless rules. This is an original arcade implementation, not a frame-for-frame reconstruction of 1945 Air Force.

The expandable 960×540 logical viewport fills the browser. Entities remap on resize without stretching aircraft; health bars and skill cards remain in view. No blue top/bottom HUD bands. Coastal pixel art, Gulu aircraft canopy sprites and mechanical effects are retained.

Drag / WASD / arrows move, auto fire, P / Escape pauses. The backpack at the right edge pauses combat to review this run's selected skill images and effects; it also opens during skill selection without changing the offered cards. Manual bombs and weapon-power pickups are removed; bullet count comes from talents and skills. Skill selection uses mouse/touch or keys 1–3, with at most three cards. Energy orbs fall, attract nearby, disappear offscreen, and fill energy bars requiring ceil((6 + 3 per skill level) × 1.5). Only energy upgrades offer later skills; talent 3 grants a second opening choice. Talent 15 still triggers automatic bombing after 30 kills.

The hangar offers 100 missions across ten chapters, plus Endless. Bosses require at least one ultimate skill and the stage's 5/6/7/8 wave minimum; ordinary waves continue while the build is incomplete. A three-second central warning with shake and alarm precedes boss entry. Bosses summon three fighters every five seconds once fully on screen, and those fighters drop energy. Stage 99 has three consecutive bosses; stage 100 has four HP-driven phases. Chapters introduce armor, sniper warnings, dash/suicide, shield/heal support, summoning, elite affixes, formations, patterned bullets and marked field lasers. Bosses alternate hard patterns and safe-lane rows, waiting for previous boss bullets to exit before starting another pattern.

Lifesteal uses actual damage; drones use current noncritical firepower. Normal enemy growth depends on stage only. Endless has additive wave HP, limited build catchup, Threat affixes/mutations, bosses every ten waves and super bosses every fifty. Six completed ultimate routes unlock Ascension.

Full reward/storage/SQL notes: ../../database/AIR-STRIKE-CAMPAIGN.md. Game saves remain per-user local; coins use the existing shared wallet. SQL is review-only and has not been executed.

## Native checks and Web pack

```powershell
godot --headless --script tests/gameplay.gd
godot --headless --script tests/progression.gd
godot --headless --script tests/campaign.gd
godot --headless --script tests/ending_audio.gd
godot --headless --script tests/boss_arrival.gd
godot --headless --script tests/skill_inventory.gd
godot --headless --script tests/soak.gd
godot --headless --export-pack Web ../../public/games/air-strike/index.pck
```

The custom web shell reuses public/games/mole-game/index.js, .wasm and worklets from the single-thread Godot 4.7.2 engine. Keep that directory when serving. Build the pet package and its postbuild step, then in snabb-superapp set SNABBB_USE_LOCAL_PET=1 and run node scripts/prepare-pet.mjs; restart Vite with --force to refresh dependencies. Standalone URL: /games/air-strike/index.html.

The 100 stages use chapter-driven formations/mechanics, not 100 individually authored art scenes. Enemy sprites are reused with role/shield/elite indicators. Headless checks verify rules and bounded entities; browser visual review and player difficulty tuning remain separate.

Results are sent to the host only after explosions finish. Victory then accelerates the surviving aircraft and drones offscreen; defeat waits for the player explosion. Cached procedural PCM cues use independent voices for weapons, hits, pickups, skills, shields, boss attacks, laser charging/firing, launch, pause and results.
