# Independent repository

Canonical source is now intern/pet-function (GitHub: MrBurDeveloperTeam/pet-function).
intern/mrbur/pet_function is a retained migration backup, not the active dependency.
Only E-learning is connected. Keep these sibling directories:

    intern/E-learning
    intern/pet-function

After a fresh checkout, install pet-function dependencies with npm ci, then install
E-learning dependencies with npm ci. Start/build E-learning normally; its lifecycle
builds the shared library and its Vite integration serves/emits canonical games.
Run npm run typecheck in pet-function. The integration tests require the sibling
calculator baseline and an E-learning build (npm run build), then npm test.

Source/public resources, configs, scripts, docs and package-lock.json are tracked.
node_modules, dist and migration-backups are ignored. The original location retains
resource backups and the one-time legacy-comment conversion script. No old registry
configuration or publishing workflow was migrated. No deployment/commit/push done.

A deployment that checks out ONLY E-learning cannot build. CI must check out both
repos in this layout and install both dependency sets; private repos require access.
