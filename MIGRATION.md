# Shared pet migration

Baseline: molar-experience Git tag v0.9.6 and calculator game files.
Only E-learning is connected in this pilot. Other apps retain their original imports.
Dialogue controllers and database adapters remain local; the existing host client
is injected into the shared authentication/currency wrapper.
No paid services, registry publication or production database changes are introduced.

Source ownership:
- src/cat: mascot rendering/animation and existing common runtime.
- src/pet: rooms, care, shop, inventory, stats and level runtime.
- src/games: shared Meowdoku launcher and game protocol.
- public/games: all four games, using calculator as the baseline.
- public/images, public/pets, public/molar-experience: shared resource delivery.

Host dev/build lifecycle runs scripts/prepare-host.mjs. It builds changed shared
source and copies canonical public files into the host. These copies are build
inputs, not independent implementations. Edit pet_function, not generated copies.

Deployment must include pet-function alongside the host at the documented
relative path (or package the built library and public resources in CI). A host-only
checkout cannot resolve the local dependency. No cloud deployment is performed here.

Rollback: app source changes are visible in each Git diff; overwritten resource
originals are retained under migration-backups. Legacy code is not removed until
authenticated desktop/mobile runtime and persistence verification has passed.
