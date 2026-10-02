# Cat Dash

Godot 4.7.2, textured 2D perspective renderer, Compatibility renderer,
single-threaded Web export. Art direction follows the original Sports stadium:
terracotta running track and blue/gold pixel details. Gameplay sides are open
calm mown pixel-art lawns and larger, more frequent trees,
inward-facing park lamps and continuous blue/gold low rails; dense stands are removed.
Menus retain their stadium decoration. Nearest texture filtering, a 1280x720 design viewport
stretched to fill the browser (including wide windows),
eight cat animation cells, and six transparent object cells replace all of the
previous low-poly geometry. Tooth pickups are friendly white characters;
dentures have cute rounded pink gums, eyes and blush.
Open `project.godot` in Godot to edit. The stadium hurdle already routes to
`stadium-hurdles`; `GamePage.tsx` embeds the exported game and credits rewards.

## Rules

- Left/right or A/D: smooth lane changes across three running lanes.
- Up, W or Space: jump; down or S: roll, or dive quickly while airborne. P/Escape pauses. Enter starts/restarts.
- Down/S repeats an eight-pose head-first ground roll using the somersault sheet
  in reverse order, with uniform scale and ground contact throughout. Each normal
  rotation takes 0.25 seconds; dive-landing rotations take 0.15 seconds. The low
  stance lasts 0.75 seconds for both actions (12 metres at base speed), independent
  of rotation speed, so the cat can reach a passage after the first rotation.
  Roll timing pauses with gameplay and Up/Space can still interrupt it instantly.
- The same aliases work during guided practice; physical WASD positions support different keyboard layouts.
- Closed dentures and traffic cones require jumping. Open dentures permit jumping
  or rolling. Benches and warning-striped athletics carts permit lane changes or a jump above 3 units.
- Rows always retain a safe lane. Every 200 teeth adds 10% of the initial speed:
  200 = 110%, 400 = 120%, 600 = 130%, without a time-based speed increase or cap;
  the run length itself has no limit. One collision ends the run.
- Collision freezes the course and rewards, then plays a 1.35-second stumble,
  curled hurt pose and orbiting pixel stars before revealing the result panel.
  A 0.38-second decaying impact shake moves all world layers together; HUD and
  result controls stay fixed, and replay clears the offset.
  Controls cannot interrupt injury; voluntary exit settles immediately.
- Result rewards use a beveled round gold coin with an embossed paw, replacing
  the simplified polygon pouch. The original cat sprites supply the hurt poses.
- Teeth are the collectibles. Wallet reward is `floor(teeth / 10)`.
- Ground teeth are missed while airborne. Seven-tooth sine arcs above jumpable
  obstacles match the cat's 1.4-second trajectory at the current run speed.
  Both obstacle and pickup insertion check a seven-metre same-lane clearance:
  low teeth underneath obstacles are removed, while elevated arcs remain.
- Each row supplies ten ground teeth and airborne teeth above its primary obstacle. Obstacle rows
  arrive every 1.65 seconds, gradually decreasing to 1.05 seconds.
- Learn to Run is a six-step interactive practice: left, right, closed-mouth
  jump, open-mouth roll, open-mouth jump and jumping along a tooth arc. The
  approaching scene freezes until the correct key is pressed; mistakes retry
  the lesson. First entry starts teaching automatically; later entries start a
  normal run directly. The right-side GUIDE button below rankings restarts the
  practice from lesson one. The host saves the first visit in browser storage
  per account (guests have a separate record), with a session fallback if blocked.
  Practice awards no wallet coins or XP and can be skipped/replayed.
- The shared host displays the same curved top-left pet exit, top-right wallet
  and cat-head level/XP badge as the other pet games. The centered left arrow
  returns only to Sports stadium. Rankings, GUIDE and pause form the right-side
  toolbar; the tooth counter sits at top center. Both exits settle an active
  run once. Starting teaching from a live run also settles its existing rewards.
- XP is `floor(activeSeconds / 60) * 2`, excluding paused/background time.
- Death or voluntary exit settles once per run. Replay creates a new run ID.
- The host verifies iframe source/origin, calculates rewards itself, and ignores
  duplicate settlements. Local preview uses its local repository; signed-in hosts
  use the existing atomic coin and XP repository mutations.

## Build and verify (PowerShell, workspace root)

```powershell
& '.tools/godot-4.7.2/Godot_v4.7.2-stable_win64_console.exe' --headless --path pet-function/godot/stadium-hurdles --editor --quit
& '.tools/godot-4.7.2/Godot_v4.7.2-stable_win64_console.exe' --headless --path pet-function/godot/stadium-hurdles --script tests/runner_test.gd
& '.tools/godot-4.7.2/Godot_v4.7.2-stable_win64_console.exe' --headless --path pet-function/godot/stadium-hurdles --export-release Web
```

From `pet-function`, run `node --test tests/stadium-runner-rewards.test.mjs tests/runner-tutorial.test.mjs`,
`npm run typecheck`, and `npm run build`. Export output lives in
`public/games/stadium-hurdles/`. The existing shared-games Vite plugin serves it.
The Superapp production build splits oversized WebAssembly files for Cloudflare.
Do not deploy an unbuilt or incomplete export.

The iframe protocol uses source `pet-function:stadium-hurdles` and messages
`RUNNER_READY`, `RUNNER_TUTORIAL_STARTED`, `RUNNER_STARTED`, `RUNNER_PROGRESS`,
`RUNNER_OVER`, and `RUNNER_CLOSE`. The host responds to ready with `RUNNER_INIT`
and the saved `tutorialSeen` flag; initialization is idempotent. It can send
`RUNNER_QUIT`, `RUNNER_PAUSE`, `RUNNER_PAUSE_TOGGLE`, `RUNNER_RANKINGS_OPEN`
or `RUNNER_TUTORIAL_START`. The iframe validates both parent identity and origin.

Art files and generation prompts are documented in `art/art-direction.md`.
`pixel_renderer.gd` owns sprites, painter's-order depth, textured moving track,
pixel particles, grounded sprites and tutorial arrows. `stand_renderer.gd`
projects continuous rails with one sandstone pillar at each 12-metre joint,
and inward-facing lamps every 72 metres, enlarged from 210 to 370 design pixels
at unit depth. Lamp bases occupy the pavement at x=5.1, separated from the
fence at x=6.08, halfway between pillars, with shared depth ordering. Trees sit on the lawn at x=11.5, every 54 metres on each side,
with 560-pixel unit-depth height (up from 420). Football goals are removed.
Trees use ground-contact shadows and remain outside the running lanes.
A sandstone verge connects the paving to the railing. Grass uses a calmer
mown-lawn pixel texture with distant detail fading to reduce shimmer.
Road, narrow paving, lawn and props use the same distance;
only the sky remains at infinity. `ground_renderer.gd` draws road, lane paint
and paving in a single depth-based shader instead of hundreds of strips.
Simulation uses 120 Hz maximum substeps
without throwing away frame time; moving sprite positions remain fractional.
Uniform fence beams use 16 continuous faces instead of 288 segmented faces per
frame. A warm pool of 160 entity nodes removes pickup-row allocation/free spikes.
The ground keeps its draw commands and updates only shader scrolling; frozen
scenery is not redrawn. Tooth shadows use one rectangle instead of three.
Entity depth order is cached until spawning or recycling changes the collection.
Sounds are cached. HUD shows a centered tooth icon/count; the host supplies pause. The result panel
shows teeth/distance and two reward cards. The canvas has a live accessibility
description and a DOM FPS diagnostic for local verification.

The camera sits above and behind the cat on its right. runner_view.gd shares the
projection with the road and stands. Background layers render below all sprites;
whole-sprite bounds avoid hiding jumping cats or side-lane objects. Ground tooth
spacing is 4.2 metres; the jump reaches 6.8 units and matching arcs clear dentures.
The camera aims ahead with the cat centered; original cat-run-cycle.png and world
positions are preserved. stadium_panel.gd draws sandstone,
blue/gold pennants, lanterns, flowers and a running-track menu border.



Result_panel.gd provides an animated illustrated stadium frame with a trophy,
tooth and distance icons, round paw coin and XP star. Results supply replay and
Back to Sports buttons; rankings use a separate board. Cone/bench atlas cells use explicit bounds because the
authored bench crosses the nominal grid; contact footprints join feet to ground.


## Cat Dash challenge and ranking update
All primary obstacle types now carry matching jump arcs, including benches and
athletics carts. Down during a jump dives at 38 units/second and lands in a roll.
Pickup contact lasts from z=-1.8 to +1.8 instead of one crossing frame. Airborne
cats still cannot collect ground teeth. Two-obstacle rows begin after 12 seconds;
row intervals decrease from 1.65 to 1.05 seconds. Speed follows tooth milestones.
Grounded Up cancels a roll or lingering dive immediately, with no jump cooldown.
A 140 ms input buffer catches a jump pressed just before touchdown; it does not
allow double jumping while airborne.
Occasional friendly NPCs appear on the left or right pavement after eight seconds.
The adjacent outer lane has a 20-metre clearance on each side; future obstacle rows
also respect that clearance. Passing in that outer lane on the ground high-fives
and awards 30 teeth once. A 0.9-second back somersault and gold-star burst play
while scenery briefly waits. NPCs never cause a collision.
The somersault uses eight individually drawn pitch poses in cat-somersault.png,
with one fixed cell scale and a smooth jump arc. Belly, paw pads and tucked back
poses keep a full silhouette throughout; no edge-on cosine squash or sideways
rotation is applied. Original running, jumping and hurt sprites are preserved.

The detailed stadium-results-frame.png and live result_panel.gd replace the old
flat rectangle. Rankings are on a separate stadium records board opened with
the list icon below the upper-right level/XP badge. Opening it pauses the simulation;
closing restores the previous menu, run, pause or results state. Its five-row pages
show top scores (and the current user's rank) using the host bridge. Each user keeps their best completed run, not the
sum of all runs. Practice and voluntary exits are excluded from ranking writes.
The loopback local preview persists a local-only best, clearly labelled; no fake
competitors are added. Authenticated hosts use cat_dash_submit_run and
cat_dash_leaderboard. Apply database/cat_dash_leaderboard.sql to the same Supabase
project before enabling shared ranking; it creates authenticated RPCs, private
run storage, deduplication and an atomic best-score upsert. SQL is prepared locally
and is not applied to production by this task. Superapp includes the same SQL as
supabase/migrations/20261001060000_cat_dash_leaderboard.sql.
