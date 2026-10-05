# Paw League

Godot 4.7.2, Compatibility renderer, single-threaded Web export. The stadium's football click and nearby Space interaction open this game through `SharedVirtualPet`.

## Play

The left/home team uses the original Mallow appearance; the right/away team uses the original Silverbelt appearance. Each team has one consistent appearance. A pixel arrow above the head identifies the controlled cat. Kick off to play. Each team has two outfield cats and an automatic goalkeeper. Move with WASD/arrows, sprint with Shift, pass/switch with J, and hold/release K to shoot. K without possession tackles in the facing direction; it cannot also shoot when that tackle succeeds. Escape pauses. On-screen direction and action buttons support touch. The home team attacks the right goal.

Regulation lasts 180 seconds of active play. Goal celebrations, countdowns and pauses do not consume match time. A tied game has up to 30 seconds of golden-goal extra time. Walls rebound the ball; no offside or stoppages. Completed matches earn 50 base coins, 30 for a win or 10 for a draw, and 5 per home goal (up to 10 goals); XP is 40 for a win, otherwise 25. Early exits earn nothing. The host verifies the active match ID, duration and result and prevents duplicate settlement.

## Architecture

- `match.gd`: deterministic simulation, player movement, stamina, possession, support/defensive AI, passing, aiming, tackling, swept goal crossing and match flow.
- `main.gd`: orthographic 3D stage with a sports-style pixel stadium backdrop, original cat sprite atlases with eight-frame paw animation, head arrow, audio feedback, menus, touch controls and JavaScriptBridge. The fixed camera and pitch_position mapping align the simulation coordinates with the authored perspective and goal centres.
- `loading.html`: custom loading screen with actual export download progress, no engine branding or town HUD.
- `tests/`: headless rule and scene regression checks, excluded from exported resources.

Use the project's `Web` preset to export to `../../public/games/stadium-football/index.html`. Tests: `godot --headless --path . --script tests/match_test.gd` and `godot --headless --path . --script tests/scene_test.gd`.

This is a local single-player game with computer teammates/opponents; it does not implement network multiplayer. Cat atlases are copied byte-for-byte from the existing pet assets. The stadium artwork is generated using the existing sports-stadium.png as a style reference; its prompt is saved in art/stadium-pixel.prompt.txt. Rendering uses unshaded nearest-filtered Sprite3D nodes to retain the original pixel colours. The ball retains 3D height and gravity; match rules are unchanged. There is no runtime generation service dependency.
