# 0.11.0 — local release preparation

This minor release adds animated cat shopkeepers and shopping conversations while retaining the existing host interfaces and independent resource delivery.

- Places the shopkeeper matching the player's selected cat beside each shopping dialog, with responsive layouts and a faster three-frame blink animation. Includes all six cats.
- Adds random welcome, insufficient-coins, purchase-success, and farewell lines. Text appears one grapheme at a time; Space completes the animation, then dismisses the line. Completed lines dismiss automatically after three seconds, and closing a shop waits for its farewell.
- Shares the typewriter behavior with outdoor NPC conversations, with suitable emoji in selected lines. Each NPC interaction still shows one line, and the four game-entrance invitations remain unchanged.
- Keeps purchase feedback tied to the existing purchase result and prevents new purchases while a shop is closing. Wearing, removing, and applying owned items retain their existing behavior.
- Makes Bedroom → My Wardrobe permanently show purchased clothes and jewelry only. Removes its Owned only / All items toggle and Browse items shortcut; shopping catalogs retain browsing and purchase controls.
- Delivers shopkeeper artwork through the existing versioned Release resource packs. Core package and per-part resource budgets remain 64 MiB.

No database migration or host API change is required for these additions. The persistence migrations introduced in 0.10.0 remain applicable.

## Validation

- Passed TypeScript checking and the full JavaScript, declaration, CSS, and resource build.
- Passed 81 targeted wardrobe, shopping dialogue, NPC, resource delivery, and package guard tests, plus the package/lockfile version consistency test.
- Verified both generated resource manifests identify 0.11.0 / v0.11.0. All 467 resource files are covered by 22 packs and 22 parts, totaling 256.66 MiB; every part is at most 64 MiB.
- Inspected the pnpm pack dry-run inventory: 80 core files, 31.35 MiB uncompressed. Compressing that inventory in memory produced approximately 25.12 MiB and passed the existing core-content and size guard. No new tarball was written; CI still checks the actual npm package before publication.

Prepared locally. No commit, tag, push, remote publication, or host dependency upgrade is included.
