# 0.9.61 — local release preparation

- Improves mobile game text clarity with a bounded higher resolution budget, readable wrapped Sky Patrol skill cards, and larger Football result/control labels.
- Shrinks mobile Football controls and ball display by 50%, retaining independent shot aiming and the shared Pass/Steal action.
- Reduces mobile Football and Whack-a-Mole tutorial panel footprint while preserving desktop tutorials.
- Adds a viewport-covering mobile mine backdrop for Whack-a-Mole.
- Moves the mobile Fishing roulette to a smaller lower-right panel, separates the bobber signal on the left, and names the required target colour.
- Retries best-effort fullscreen from game iframe touch gestures without blocking unsupported browsers.
- Starts mobile sponsor videos muted and inline. When iOS blocks autoplay, a one-time start action avoids an inaccessible video cover; watched-time requirements and revival limits remain intact.

Validation: full build including declarations, TypeScript check and 224 package-local Node tests passed. Native Football touch/tutorial tests, Sky Patrol card selection tests and Whack-a-Mole hit/pause tests passed during implementation. Real-device visual/FPS and iOS autoplay verification remain outstanding. Cross-project adapter/migration tests requiring external host installations are excluded from the 224-test package-local run.

Prepared locally; no commit, tag, push or remote publication performed. Superapp dependency remains at the published 0.9.60 until upgraded separately.
