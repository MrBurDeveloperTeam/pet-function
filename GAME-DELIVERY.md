# Direct game delivery (E-learning pilot)

## Godot game source

The editable Godot project for the shared mole game lives at
`godot/mole-game/project.godot`. Open that project when changing gameplay,
scenes, scripts, or source artwork. Godot's generated `.godot` cache is ignored.

Web exports belong in `public/games/mole-game/`. That directory is the runtime
artifact served to every consuming mini app at `/games/mole-game/index.html`;
do not treat the exported files as the editable game source.

Development: scripts/vite-games.mjs serves /games/** directly from
pet_function/public/games. No executable copies are created in E-learning/public.
Shared game file edits are read on subsequent requests; reload the game to see them.

Build: host public copying is disabled. The plugin delivers other host public
resources, excludes the entire host public/games directory, then copies canonical
shared games directly to dist/games and verifies byte equality. Preview/deployment
serves these build results. Rebuild/redeploy after shared changes.

Legacy E-learning/public/games HTML/JS/CSS files are comments only. Original lines
are preserved (JS line comments; HTML/CSS JSON-encoded line comments to safely
retain embedded comment delimiters). Images/audio remain for reference but the
entire legacy game directory is excluded from build output.

This document supersedes earlier public-game synchronization instructions in
PILOT.md and MIGRATION.md. Other apps are not connected. No paid service added.
