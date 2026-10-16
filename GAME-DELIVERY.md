# Direct game delivery (E-learning pilot)

## Godot game source

The editable Godot project for the shared mole game lives at
`godot/mole-game/project.godot`. Open that project when changing gameplay,
scenes, scripts, or source artwork. Godot's generated `.godot` cache is ignored.

Web exports belong in `public/games/mole-game/`. That directory is the runtime
artifact served to every consuming mini app at `/games/mole-game/index.html`;
do not treat the exported files as the editable game source.

Development: scripts/vite-games.mjs serves /games/** and /pet-function/** directly
from the resolved resources. Source checkouts use their public/ directory;
installed core packages first restore the matching Release resources to a verified
cache. No executable game copies are created in Vite hosts' public/games.
Shared source file edits are read on subsequent requests; reload to see them.

Build: host public copying is disabled. The plugin preserves unrelated host public
resources and excludes stale host games/pet-function copies, then copies the
resolved canonical resources to their original output paths. This copy completes
before post-build Cloudflare game splitting. Preview/deployment serves these
results. Rebuild/redeploy after changing the shared dependency version.

Legacy E-learning/public/games HTML/JS/CSS files are comments only. Original lines
are preserved (JS line comments; HTML/CSS JSON-encoded line comments to safely
retain embedded comment delimiters). Images/audio remain for reference but the
entire legacy game directory is excluded from build output.

This document supersedes earlier public-game synchronization instructions in
PILOT.md and MIGRATION.md. The seven existing hosts are adapted to resolve the
matching resources; Next retains its /games rewrite and generated public folder.
See RESOURCE-DELIVERY.md for Release publishing and private-repository credentials.

## Package size and resource exports

The core package has a 64 MiB budget, below the registry's 256 MiB limit.
Bulk public art and games are Release resources, each attachment capped at 64 MiB.
Keep both package and resource publication checks enabled.

`scripts/postbuild.mjs` reuses byte-identical images from `public/pet-function/`
instead of shipping a second copy in `dist/`. Generated ESM fallbacks use static
`new URL(..., import.meta.url)` expressions so host bundlers can emit the retained
public images. The host-copyable public paths and artwork bytes are unchanged.

Godot exports exclude obsolete concept/background art. Cat Kart exports the seven
ready-made `built/*.scn` scenes and their dependencies, its runtime scripts,
shaders, font, and audio. Source GLBs and other authoring resources remain in the
Godot project for editing and baking, outside the web pack. Keep dynamic script
and resource loads explicitly listed in its `export_files`; selecting the main
scene alone does not include all of those loads.

After changing export selections, run the exported pack itself. For Cat Kart,
pass `--headless --main-pack public/games/cat-kart/index.pck --script` followed by
the absolute path of `godot/cat-kart/tests/package_test.gd` to the Godot executable.
This verifies the packaged main scene, all six cats, animation nodes, shaders,
font, and audio. Update each changed game's HTML PCK cache revision and its
`fileSizes` entry, when present, to match the exported file.
