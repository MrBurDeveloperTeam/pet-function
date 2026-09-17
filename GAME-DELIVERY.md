# Direct game delivery (E-learning pilot)

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
