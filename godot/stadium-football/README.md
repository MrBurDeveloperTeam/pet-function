# Paw League

Godot 4.7.2, Compatibility renderer, single-threaded Web export. The stadium's football click and nearby Space interaction open this game through `SharedVirtualPet`.

## Play

The left/home team uses the original Mallow appearance; the right/away team uses the original Silverbelt appearance. Each team has one consistent appearance. A pixel arrow above the head identifies the controlled cat. Kick off to play. Each team has two outfield cats and an automatic goalkeeper. Move with WASD/arrows, sprint with Shift, pass with C, and hold/release SPACE to shoot. Tap SPACE without possession to tackle within 2.5 units in any facing direction; it cannot also shoot when that tackle succeeds. Escape pauses. On-screen direction and action buttons support touch. The home team attacks the right goal.

Regulation lasts 180 seconds of active play. Goal celebrations, countdowns and pauses do not consume match time. A tied game has up to 30 seconds of golden-goal extra time. Walls rebound the ball; no offside or stoppages. Completed matches earn 50 base coins, 30 for a win or 10 for a draw, and 5 per home goal (up to 10 goals); XP is 40 for a win, otherwise 25. Early exits earn nothing. The host verifies the active match ID, duration and result and prevents duplicate settlement.

The ball has a high-contrast outline and BALL label, rendered over cat sprites so overlapping players cannot hide it. The SPACE button switches between SHOOT and TACKLE with possession. Live guidance uses the simulation's exact tackle range and cooldown conditions; a green STEAL NOW prompt and SPACE: STEAL ball label appear only when a tackle can succeed. Loose balls and teammate possession have separate movement/positioning instructions.

Both goal frames use enlarged artwork in `art/stadium-wide-goals.png`. Goal openings span 10 simulation units (previously 6.8), with a 4-unit crossbar; swept scoring and wall rebounds share those dimensions. Keeper coverage follows the wider mouth. Tests cover wing shots at both ends and misses beyond the posts or over the crossbar. The original stadium image is retained; the built-in imagegen edit prompt is saved in `art/stadium-wide-goals.prompt.txt`.

Loose-ball reception checks the whole ball flight segment and resolves the earliest eligible cat contact before a later goal crossing. The 0.22-second kick lock applies only to the kicker; teammates and opponents can immediately receive or intercept low passes. Airborne balls above catch height and stunned cats remain excluded. Receiving stops ball velocity and transfers possession; goalkeepers remain automatic. Each successful pass, from either team, starts a new numbered defensive selection cycle. When an opponent next holds the ball, select the home outfield cat nearest that carrier exactly once and lock that selection until the next pass or a new opponent takes possession. Moving players, incidental teammate pickups, and C without possession do not unlock the selected cat. Only a pass from the controlled home cat transfers control to the actual home outfield receiver on reception; an intercepted pass does not select its intended recipient.

Tackle attempts recover after 0.3 seconds. Pass launch speed is 10 units/second (previously 14), allowing more time to position for reception and interception. Shot speed is unchanged.

Each team has one stable pressing outfield role per possession/flight, while the other cat covers a central lane six units behind the ball. When defending, the home AI leaves pressing to the controlled cat. Covering AI cats do not also attempt tackles. With team possession, the supporting cat opens the opposite wing for a pass; the intended recipient follows an in-flight pass. Keepers track laterally at their own goal instead of chasing the ball out of position.

## Architecture

- `match.gd`: deterministic simulation, player movement, stamina, possession, support/defensive AI, passing, aiming, tackling, swept goal crossing and match flow.
- `main.gd`: orthographic 3D stage with a sports-style pixel stadium backdrop, original cat sprite atlases with eight-frame paw animation, head arrow, audio feedback, menus, touch controls and JavaScriptBridge. The fixed camera and pitch_position mapping align the simulation coordinates with the authored perspective and goal centres.
- `loading.html`: custom loading screen with actual export download progress, no engine branding or town HUD.
- `tests/`: headless rule and scene regression checks, excluded from exported resources.

Use the project's `Web` preset to export to `../../public/games/stadium-football/index.html`. Tests: `godot --headless --path . --script tests/match_test.gd` and `godot --headless --path . --script tests/scene_test.gd`.

This is a local single-player game with computer teammates/opponents; it does not implement network multiplayer. Cat atlases are copied byte-for-byte from the existing pet assets. The stadium artwork is generated using the existing sports-stadium.png as a style reference; its prompt is saved in art/stadium-pixel.prompt.txt. Rendering uses unshaded nearest-filtered Sprite3D nodes to retain the original pixel colours. The ball retains 3D height and gravity; match rules are unchanged. There is no runtime generation service dependency.

Away difficulty is 0.8: movement/acceleration and keeper shot-catch radius use 80% of baseline, AI action intervals are divided by 0.8, and shot power/accuracy scale with the same difficulty setting. Friendly AI attacks the open side of the goal. Fresh possession has a 0.65-second guard against AI steal-back (player tackles remain available), avoiding immediate possession loops. SPACE during friendly teammate possession calls a pass to the controlled cat. Kicks originate at the current carrier position. Defender selection records both pass sequence and opponent carrier to prevent stale locks during rapid consecutive passes or turnovers.

Passes and loose balls use a 1.8-unit body-contact reception radius, including side-on swept contacts. Shots retain their prior save radius/difficulty. Ball outlines are yellow for home possession, red for away possession, and neutral while loose. Home tackles and interceptions increment a possession event counter; the scene shows a 1.2-second success message, a short sound, and a brief ball-marker pulse.

The game scene supplies pass reception with swept screen-space bounds from each original sprite frame, including the sprite offset above the feet and the visible ball body radius. Cat motion is included in the relative sweep so a fast ball or a moving cat cannot skip a contact between frames. Bounds are cached by team/frame; the deterministic model retains its 1.8-unit fallback for non-rendering clients. Shots keep the existing save geometry.

Keeper catches start a 2.5-second protected hold. All four outfield cats, including the controlled player, automatically run toward fresh random destinations across the full pitch during the hold. Destinations are sampled once per catch, at least five units apart and outside both keeper areas; cats move normally toward them during the 2.5-second interval. On expiry the keeper randomly passes to one of its two outfield teammates using an ordinary, interceptable pass. Outfield cats cannot enter the 2.4-unit keeper exclusion radius at either goal during play. Player calls/tackles cannot interrupt keeper distribution. The countdown freezes during pause. Tests cover both goals, random recipient selection, early-release protection, keep-out movement, and interception with the actual sprite-body contact rules.

While charging a shot, a yellow dashed guide with a dark outline previews the exact player shooting direction. Its length grows with charge and it disappears on release, possession loss, or pause. Directional input sets the shot direction; without input, the last cat heading is used. Player shots have no goal-centre attraction or random direction spread.

Wall rebounds and shots slowed to six units/second below reception height become ordinary loose balls, restoring visible sprite-body pickup instead of retaining the smaller shot-save geometry. Successful reception clears shot state.

Keeper distribution scales horizontal launch speed with the selected teammate distance: 10 units/second up to six units away, then +0.45 speed per extra unit, capped at 26. Low loft and normal swept body reception preserve interception throughout the flight. Outfield passing retains its existing speed.

Match HUD uses a text-free segmented stamina column at centre-left, with a pixel lightning emblem, jade cells, and amber low-energy state. A gold-trimmed bottom-centre SPACE key prompt softly pulses only for available tackles or player shooting, with charge progress inside. Desktop keyboard controls remain; legacy on-screen movement/action buttons and possession panel are hidden.

Top navigation uses icon-only return and pause controls with the same layered gold/green pixel framing as the scoreboard and match HUD. The result card includes a striped miniature pitch and football medallion. Football launches without requesting browser fullscreen or orientation lock.

The menu replaces its control manual with Learn to Play: five interactive spotlight exercises for movement, sprinting, completed passing, charged shooting, and a successful tackle. Training freezes AI and match time, can be skipped, and can be restarted from pause. Completion starts a fresh match; training never settles rewards.

Embedded entry uses a same-origin initialization handshake and per-user browser-local tutorial completion flag. New players enter training automatically; completing or skipping it records completion. Returning players start a match. A book icon below pause restarts training. Standalone preview uses a separate guest flag; storage does not sync across devices.

Tutorial shooting and tackling keep the real operation result on screen for 2.2 seconds before advancing. Shooting continues ball physics with the spotlight covering its flight; tackling retains yellow-ring possession and allows dribbling. No celebration effect replaces the actual result.

X switches control between the two home outfield cats and cancels any current shot charge. Explicit defensive selection stays locked for the current carrier/pass cycle. Tutorial includes a sixth exercise requiring X and showing the control arrow transfer.

Moving passes exclude their kicker until the pass slows to three units/second or possession changes, preventing immediate self-reception while retaining stopped-ball recovery. Home AI outfield teammates now pursue loose/opponent balls and sprint while stamina permits, can tackle regardless of pressing role, then use normal attacking pass/shot decisions. Keeper distribution protection and own-possession support still apply.

Keeper distribution now compares both recipient lanes immediately before release. It samples interception windows using opponent position, velocity, reachable distance, and distance-scaled pass travel time, preferring lower risk with a small distance cost. Near ties remain random; passes retain normal interception rules.

Final results render above a full-screen dark scrim and hide live ball markers. The final-whistle card features a striped football pitch with goals/netting, team portraits, prominent score, separate match-stat tiles, rewards, and parallel rematch/stadium actions.

Exhausted sprinting falls back to walking until stamina reaches 20%, preventing frame-by-frame speed toggling. Cat animation integrates a continuous speed-dependent phase. AI possession-tackle attempts have a 50% success chance; player tackles and loose-ball reception retain existing rules.

Every position/kickoff reset restores all cats to full stamina and clears sprint exhaustion. Tutorial X switching keeps the newly controlled cat and arrow visible for the 2.2-second result observation, allowing movement before training ends.

Results now use the original Cat Dash stadium trophy/laurel/stone-stand artwork, with live football scores, team portraits, football emblems, reward icons and controls laid out within the blue presentation board. Loading uses the matching full-bleed stadium entrance artwork with left-aligned title and real progress. Sources are copied from stadium-hurdles assets, with runtime text kept live.

Football v2 replaces reused running-game visuals with independent built-in imagegen assets: loading-football-v2.png shows a players tunnel and football pitch; football-results-frame-v2.png has goal nets, football trophy and grass. Prompts are saved in art/football-v2-prompts.txt.
