# E-learning pilot

Package name: pet-function. E-learning imports pet-function/pet, pet-function/cat,
pet-function/ai, pet-function/contracts, pet-function/options,
pet-function/resources and pet-function/styles.css. The dependency resolves to
file:../pet-function, not the separate molar-experience folder.

Only E-learning is connected. Calculator, appointment, inventory, todo,
Image-generator, snabb-superapp, aiboard and AI-Dashboard retain their original
dependency manifests and source content.

Baseline: calculator and molar-experience v0.9.6. This also intentionally brings
calculator's game version to E-learning; prior E-learning game resources are
backed up in migration-backups/E-learning/public.

Maintain shared cat UI/runtime in src/cat, pet care/rooms/shop/stats in src/pet,
Meowdoku account bridge in src/games, all four game implementations in
public/games, and images/pet resources in public. E-learning dialogue and its
database repository remain local. Its two launchers only inject the existing
client/repository and opening/closing props.

Start E-learning with npm run dev (or npm run dev:frontend). Build with npm run
build (or npm run build:frontend). Each command first builds changed shared
sources and copies shared non-game public resources. Games are served directly
from pet_function/public/games in development and written directly to dist/games
on build. E-learning/public/games contains inactive comments and is excluded.
Reload the game after game-file edits; restart development after shared component
edits. Rebuild and redeploy for production changes. See GAME-DELIVERY.md.

This is a local file dependency, not a registry publication or deployment. Import
adds no paid service. Existing backend/geolocation calls retain existing behavior.

Manual acceptance: log in, open the cat/pet, verify dialogue, pet appearance,
adoption/care, shop/inventory, currency, room controls, all four games, mobile
controls/fullscreen, close/reopen, Meowdoku hints/rewards, refresh persistence,
and sign out/change accounts. Builds and file equality do not prove these account
flows; do not expand to other apps until they pass.
