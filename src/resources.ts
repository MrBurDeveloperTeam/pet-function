// Stable host-owned URLs for the shared package's portable-asset override
// props (`SharedCatMascot.spriteSheetUrls`, `SharedMolarAI.logoUrl`,
// `SharedVirtualPet.assetUrls` — all added in 0.6.0, previously unused
// while this host was pinned to 0.5.0). Without these overrides, the
// package falls back to its own internally-bundled, package-relative,
// opaque-hash asset paths (e.g. `./mallow-spritesheet-<hash>.webp`),
// which are not guaranteed portable across bundlers/hosts.
//
// Byte source: the exact files copied into public/molar-experience/ were
// verified via SHA-256 against node_modules/@mrburdeveloperteam/
// molar-experience/dist/*'s own shipped assets for the installed 0.6.1
// version — see the Phase 2B verification report for the 13/13 match.
//
// SharedCatMascot's `SharedCatPetId` / SharedVirtualPet's `PetId` are the
// same 6-value union ('mallow' | 'silverbelt' | 'fastrat' | 'gulu' |
// 'munchkin' | 'mochi'), confirmed directly from the installed package's
// own .d.ts files.
//
// `PetAssetUrls` (the type of SharedVirtualPet's `assetUrls` prop) is
// declared but not a named export of the package's `pet` entry point —
// PET_ASSET_URLS is therefore left structurally typed (no imported type
// annotation) rather than worked around with an unsafe cast; it still
// type-checks against `SharedVirtualPetProps.assetUrls` structurally,
// since that prop's shape is exported even though the standalone
// interface name is not.

const PET_SPRITE_SHEET_URLS = {
  mallow: '/molar-experience/pets/mallow-spritesheet.webp',
  silverbelt: '/molar-experience/pets/silverbelt-spritesheet.webp',
  fastrat: '/molar-experience/pets/fastrat-spritesheet.webp',
  gulu: '/molar-experience/pets/gulu-spritesheet.webp',
  munchkin: '/molar-experience/pets/munchkin-spritesheet.webp',
  mochi: '/molar-experience/pets/mochi-spritesheet.webp',
} as const;

/** For SharedCatMascot's `spriteSheetUrls` prop. */
export const CAT_SPRITE_SHEET_URLS = PET_SPRITE_SHEET_URLS;

/** For SharedMolarAI's `logoUrl` prop. */
export const MOLAR_LOGO_URL = '/molar-experience/ai/ai_logo.png';

/** For SharedVirtualPet's `assetUrls` prop. */
export const PET_ASSET_URLS = {
  spriteSheets: PET_SPRITE_SHEET_URLS,
  beds: {
    grey: '/molar-experience/pet/grey_bed.png',
    red: '/molar-experience/pet/red_bed.png',
    purple: '/molar-experience/pet/purple_bed.png',
  },
  care: {
    poop: '/molar-experience/pet/poop.png',
    shower: '/molar-experience/pet/shower.png',
    soap: '/molar-experience/pet/soap.png',
  },
};
