# Sky Patrol — Godot arcade shooter

Godot 4.7.2 handles drawing, input, collision, projectiles, audio, talents and campaign logic. main.gd owns combat/rendering, progression.gd owns skills, campaign.gd owns chapters, waves, abilities, hazards, bosses and Endless rules. This is an original arcade implementation, not a frame-for-frame reconstruction of 1945 Air Force.

The expandable 960×540 logical viewport fills the browser. Entities remap on resize without stretching aircraft; health bars and skill cards remain in view. No blue top/bottom HUD bands. Coastal pixel art, Gulu aircraft canopy sprites and mechanical effects are retained.

Drag / WASD / arrows move, auto fire, B / Space / second finger bombs, P / Escape pauses. Skill selection: mouse/touch or keys 1–4. Energy orbs fall, attract nearby, disappear offscreen, and fill progressively longer energy bars. Normal waves also offer skills; talent 3 adds a fourth candidate.

The hangar unlocks 100 missions sequentially across ten chapters, then Endless. Bosses appear after fixed 5/6/7/8 waves without a build gate. Stage 99 has three consecutive bosses; stage 100 has four HP-driven phases. Chapters introduce armor, sniper warnings, dash/suicide, shield/heal support, summoning, elite affixes, formations, patterned bullets and marked field lasers. Bosses alternate hard patterns and safe-lane rows, waiting for previous boss bullets to exit before starting another pattern.

Lifesteal uses actual damage; drones use current noncritical firepower. Normal enemy growth depends on stage only. Endless has additive wave HP, limited build catchup, Threat affixes/mutations, bosses every ten waves and super bosses every fifty. Six completed ultimate routes unlock Ascension.

Full reward/storage/SQL notes: ../../database/AIR-STRIKE-CAMPAIGN.md. Game saves remain per-user local; coins use the existing shared wallet. SQL is review-only and has not been executed.

## Native checks and Web pack

```powershell
godot --headless --script tests/gameplay.gd
godot --headless --script tests/progression.gd
godot --headless --script tests/campaign.gd
godot --headless --script tests/soak.gd
godot --headless --export-pack Web ../../public/games/air-strike/index.pck
```

The custom web shell reuses public/games/mole-game/index.js, .wasm and worklets from the single-thread Godot 4.7.2 engine. Keep that directory when serving. Build the pet package and its postbuild step, then in snabb-superapp set SNABBB_USE_LOCAL_PET=1 and run node scripts/prepare-pet.mjs; restart Vite with --force to refresh dependencies. Standalone URL: /games/air-strike/index.html.

The 100 stages use chapter-driven formations/mechanics, not 100 individually authored art scenes. Enemy sprites are reused with role/shield/elite indicators. Headless checks verify rules and bounded entities; browser visual review and player difficulty tuning remain separate.
