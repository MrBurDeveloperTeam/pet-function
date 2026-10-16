# Shared pet behavior contracts

## Floating companion sayings

- Scope source: user's screenshot and clarification, 2026-10-16. Applies to the
  floating cat on Superapp, Inventory, Appointment, Image Generator, Calculator,
  Todo and E-learning pages. Pet-room NPC/shop dialogue is separate.
- Canonical owners: useMeowDialogue.ts (account lifecycle, timing, priorities),
  meowDialogue.mjs (states/defaults/validation), meowDialogueCloud.mjs (AIBoard
  persistence), original AIBoard Meow Dialogue (editing), meow-presets.css (style).
- The five existing AIBoard states and configured timing/disabled flags remain.
  Personal text supplements built-ins; identical lines are deduplicated and the
  random picker avoids immediate repetition. Welcome/business dialogue takes priority.
- No settings/filter button or AIBoard entry appears beside the cat. Ordinary cat
  clicks retain the pet-room destination. Editing uses the original AIBoard page.
- Saved dialogue is rendered as plain text, with no HTML interpretation.
- Authenticated identity is checked at every operation, config queries are scoped
  to user_id, and updates/deletes require original text and owned row identity.
  Each new-line intent retains its UUID through uncertain retries. RLS is still
  required server-side; actual live policies must pass the read-only schema audit.
- Pending saves prevent duplicate actions; failures retain text and offer retry
  or reload. A conflicting edit requires comparison with the latest saved version.
  Success is shown only after a receipt. Account changes clear private text and
  invalidate late responses. Sleep/hide pauses the loop and invalidates old work.
- Read failures fall back to built-ins and expose editor Retry. Focus, visibility,
  60-second refresh and same-origin BroadcastChannel revalidate confirmed data;
  background reads pause while editing to preserve the draft's comparison baseline.
- Verification: tests/meow-dialogue.test.mjs, tests/meow-dialogue-cloud.test.mjs,
  existing seven-host dialogue/identity/bed tests, isolated browser CRUD/failure/
  account-switch/narrow-viewport checks. See AIBOARD-DIALOGUE.md for deployment scope.

## Wardrobe

- Canonical CRUD owner: usePetWardrobe.ts and PetRepository wardrobe methods.
  Catalog metadata: wardrobe.mjs; authenticated server prices: database/pet_wardrobe.sql.
- Purchases charge the existing coin wallet atomically and grant permanent ownership.
  Duplicate purchase is idempotent. Purchase does not equip automatically.
- Body and neck are separate slots; ownership is shared across six cats, equipment
  is saved independently for each cat. Remove only clears a slot, retaining ownership.
- Bedroom's My Wardrobe always lists owned items only, with no catalog filter,
  purchase action or Browse items shortcut. Shops retain full-catalog browsing.
- Trial: preview shop items or owned wardrobe items on any of six cats. Preview is explicitly unsaved until
  Wear succeeds. Switching cats in the preview does not change adoption identity.
- Pending: prevent duplicate mutations and new requests until confirmation.
  Failure preserves confirmed appearance, blocks further edits, and offers Retry.
  Session changes invalidate late responses; focus/visibility revalidates saved outfits.
- Canonical dialog owner: PixelShopDialog.tsx; wardrobe is the pixel-shop variant.
  Escape closes My Wardrobe directly; shop variants first finish a farewell.
  Tab is trapped; background is inert; focus restores to the opener.
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
confirmation. Insufficient funds keep Buy reachable to explain the shortfall
through the shopkeeper without sending a purchase request. Loading, inline Retry and aria-live
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

## Shopping conversations

The user's shop-dialogue request defines these occasions and their English
phrases: enter, insufficient coins, completed purchase, and leave. Canonical
content owner: src/pet/internal/shopDialogue.mjs. Each occasion picks one phrase;
shelf navigation does not restart the welcome. ShopDialogueProvider is scoped
to one shop visit; closing or switching shops clears its timers and messages.

- Canonical feedback owner: components/ShopDialogue.tsx. It is non-modal inside
  the store, so the catalog stays usable during welcome and purchase feedback.
- Canonical timing/keyboard owner: components/useTypewriterDialogue.ts and
  components/typewriterDialogue.mjs, shared with outdoor NPC dialogue. Reveal
  graphemes every 28ms; Space skips typing, then dismisses a completed line.
  Holding Space cannot dismiss a second line or activate the focused Buy/X.
  Inputs and IME composition retain their normal keyboard behavior.
- A completed line remains for three seconds before automatic dismissal.
  Replacing or unmounting a line cancels both typing and dismissal timers.
- Clicking X or pressing Escape requests farewell; dismissing that line closes
  the store. Repeated close requests cannot reset it. Purchase actions are paused
  during farewell, and late purchase results cannot overwrite it.
- Insufficient-coins clicks never call a purchase API. Confirmed wardrobe,
  cabinet and decor purchases trigger success; Wear/Use/Remove do not.
  Food, toys and rods retain the existing synchronous buyItem/local-acceptance
  behavior; their success line does not certify completion of cloud persistence.
- Outdoor NPCs retain one line per interaction and outside-click dismissal.
  Their four game-entrance invitations keep their authored text. Optional emoji
  are part of full graphemes, never partial frames.
- Verification: tests/typewriter-dialogue.test.mjs, tests/shop-dialogue.test.mjs,
  tests/npc-dialogue.test.mjs plus isolated browser purchase/shortfall/close flows.
