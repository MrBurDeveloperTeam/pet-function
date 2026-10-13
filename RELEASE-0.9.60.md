# 0.9.60 — local release preparation

- Adds up to three shared coin/ad revivals per run for Sky Patrol and Hurdles. Coin costs are 200, 800 and 2,000. Sponsor videos come from the Mr Bur / Kaneiko e-learning catalog and require 30 seconds of actual playback before skipping to revive.
- Completes death animations before offering revival, confirms engine resumption, and uses separate illustrated revival frames for each game.
- Updates mobile cat scenes with floating joysticks and release fade-out. Cat scenes, Fishing, Sky Patrol and Hurdles require portrait; Football, Kart Racing and Whack-a-Mole retain landscape requirements. Games interrupted by rotation require explicit resume.
- Attempts fullscreen across the mobile pet visit without blocking unsupported browsers or players who exit fullscreen.
- Refines mobile Football controls: smaller translucent action fan, independent drag-to-aim shooting, a shared Pass/Steal button and matching tutorial instructions and completion checks. Desktop input and tutorial behavior are retained.
- Displays mobile Sky Patrol skill choices in one row with matching drawing and touch hit areas.
- Reduces mobile render resolution cost across Godot games, merges Fishing animation updates, stops idle room work, limits long-frame jumps in Tetris, moves PAC-CAT with compositor transforms and reuses Meowdoku cell nodes.

Validation: full build including declarations, TypeScript checks and 224 package-local Node tests passed. The local-network game-serving test passed separately. Native mobile-control, skill-card and revival checks passed during implementation. Superapp production build and 141 canonical game assets were verified before the version bump. No real-device FPS benchmark has been performed.

The broad cross-project test run also has nine pre-existing failures involving external host adapter dependencies and the older Inventory installation/build. These do not represent passing release checks and remain recorded in `release-tests.local.log`.

This version has not been pushed, tagged or published. The Superapp dependency version has not been upgraded as part of this request.
