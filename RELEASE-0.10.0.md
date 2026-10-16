# 0.10.0 — local release preparation

This minor release adds independent wardrobe and room decoration choices, NPC conversations, and new fishing rewards while retaining the existing host entry points.

- Adds complete animated outfits for all six cats: Rose Knit, Sky Sailor, Forest Vest, and Royal Cape. Clothing and jewelry have separate selections, and switching wardrobe categories preserves the current try-on combination. Clothing and jewelry shops show their own categories; the bedroom wardrobe supports both.
- Groups room decorations under Shopping → Furniture Shop → Room Decor, with whole-room previews and furniture categories for Games, Bathroom, Bedroom, and Kitchen. Cabinet, curtain, rug, and special furniture skins can be mixed independently at their original positions. Special furniture includes the games TV console, bathroom toilet, bedroom bed, and kitchen refrigerator. Removes the separate Cabinets and legacy Beds shop entries.
- Adds 160 random NPC dialogue lines across eight moods. Each interaction shows one line in a bottom dialogue panel without a name; dismissing it ends the conversation. Existing game entrance invitations remain unchanged.
- Fits Football tutorial highlights to the cat across screen sizes and makes the kickoff countdown larger and higher. Aligns shop door interaction outlines with the artwork.
- Adds 50 fish to the existing fishing catalog, with inventory artwork and feeding support, while preserving the existing rarity probabilities and rod bonuses.
- Removes superseded wardrobe assets, unused fallback code and styles, and temporary generation/review files. Keeps the production assets and art validation fixtures.
- Publishes a small core package separately from versioned resource packs in the same repository's GitHub Releases. Images and games remain in this source tree; new content is grouped automatically and each attachment is split at 64 MiB, including large individual files. Hosts restore and verify the matching resources before serving or building, retaining the existing URLs. Updates the seven existing host adapters for this one-time delivery change without changing their dependency pins.
- Shares 12 byte-identical public images with the generated ESM entries and exports only runtime game resources. Retains the original artwork bytes and all six baked Cat Kart models. Updates game cache revisions and loading manifest sizes.

## Hosted account setup

New wardrobe, cabinet, and decor persistence uses the optional repository methods and migrations in `database/pet_wardrobe.sql`, `database/pet_cabinets.sql`, and `database/pet_room_decor.sql`. Review and install the required migrations before exposing purchases to hosted accounts. The existing `inventory_pet` wallet is required. Previously installed migrations do not need reinstalling for artwork updates. No remote database changes are included in this local preparation.

## Validation

- Passed 47 wardrobe, cabinet, room decor, NPC, and fishing tests, the package/lockfile version consistency test, and the two package size guard unit tests.
- Passed strict TypeScript checking with unused local/parameter checks and the full JavaScript, declaration, and CSS build.
- Packed the actual core locally after the build: approximately 25.09 MiB, below its 64 MiB budget and the registry's unchanged 256 MiB limit. Verified all 35 exported files and 13 retained public fallback images. Bulk games/art and resource packs are absent from the core archive.
- Generated 461 resource files in 21 independent resource packs, currently 21 parts totaling 255.91 MiB; the largest attachment is 50.70 MiB. Each part is limited to 64 MiB. All 461 files were restored from a thin-core fixture and individually verified by SHA-256; subsequent offline cache reuse passed. Production images retain their original bytes.
- Verified an isolated Vite consumer build and Node ESM rendering: all 12 deduplicated fallback images resolve and retain their original bytes. Direct headless runs passed for all four changed game packs; the Cat Kart pack test additionally loaded all six cats, animation nodes, shaders, font, and audio.
- The full Node suite after resource splitting ran 310 cases: 296 passed and 14 existing failures remain, with no new failures. The previous game-serving/traversal failure is resolved. Remaining failures involve host adapter installations, host build copies, and outdated behavior assertions. Resource generation, download/cache integrity, catalog compatibility, and host integration tests pass.
- The seven host adapter compatibility checks passed in isolated thin-core, legacy-package, and local-development fixtures. Remote GitHub publication and full deployed-host verification were not performed.

Prepared locally; no commit, tag, push, or remote publication performed. Host application dependency versions are unchanged. Private resource repositories require build-server credentials with access to the resource repository; see `RESOURCE-DELIVERY.md`.
