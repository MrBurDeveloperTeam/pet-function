# Shared pet behavior contracts

## Wardrobe

- Canonical CRUD owner: usePetWardrobe.ts and PetRepository wardrobe methods.
  Catalog metadata: wardrobe.mjs; authenticated server prices: database/pet_wardrobe.sql.
- Purchases charge the existing coin wallet atomically and grant permanent ownership.
  Duplicate purchase is idempotent. Purchase does not equip automatically.
- Body and neck are separate slots; ownership is shared across six cats, equipment
  is saved independently for each cat. Remove only clears a slot, retaining ownership.
- Trial: preview any item on any of six cats. Preview is explicitly unsaved until
  Wear succeeds. Switching cats in the preview does not change adoption identity.
- Pending: prevent duplicate mutations and new requests until confirmation.
  Failure preserves confirmed appearance, blocks further edits, and offers Retry.
  Session changes invalidate late responses; focus/visibility revalidates saved outfits.
- Canonical dialog owner: PixelShopDialog.tsx; wardrobe is the pixel-shop variant.
  Escape closes; Tab is trapped; background is inert; focus restores to the opener.
  Header and status remain outside the single scroll owner. No nested modal stacking.
- Canonical controls: semantic buttons in WardrobeShop.tsx with pressed states,
  keyboard focus, minimum 44px touch targets and disabled saving states.
- Canonical feedback: inline error with Retry plus persistent aria-live save status.
  Success is announced only for confirmed receipts; no native alerts or confirmations.
- Scrollbar: inherited application scrollbar; wardrobe controls only scroll geometry.
- Locale: existing English game labels; no new locale or theme provider.
- Select/listbox, date, table selection and editable forms: not applicable to wardrobe.

## Verification

Room Decor: choose a room from its full background thumbnail, choose a furniture
category, then Buy and Use. Cabinets appear only inside the corresponding room,
using existing cabinet ownership and selections; no data migration is needed.
The standalone Cabinets and legacy pet Beds store entries are removed. A purchase
adds ownership without automatically applying it. Use original resets only that
ROOM:slot; other furniture and ownership persist. Use/Buy controls are disabled during
confirmation and insufficient funds disable Buy. Loading, inline Retry and aria-live
confirmed status share the established store patterns. Independent room skins do not
change pet bed equipment, wardrobe, interaction targets, or navigation. Verify with
tests/room-decor.test.mjs and scripts/check-decor-sql.mjs (local PostgreSQL only).

Run tests/wardrobe.test.mjs for ownership, slot validation, six-cat art and receipts.
All four clothing items use one complete dressed-cat atlas per cat. Pet.tsx resolves appearance
through usePetAppearance: images are loaded and decoded together before changing
the rendered layers; failed loads retain no partial outfit and can retry on focus
or reconnect. Removing body equipment restores that cat's original sprite sheet.
Neck equipment uses an independent fitted layer for the selected body item.
Use scripts/check-wardrobe-sql.mjs with a local PGlite module for isolated SQL/RLS
verification. Never connect this script to a remote database. Review desktop/mobile
preview, purchase, Wear, Remove, refresh restoration and keyboard focus in the browser.
