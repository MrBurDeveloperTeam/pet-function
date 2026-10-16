---
version: alpha
name: Shared Snabbb Pet
omitted:
  - section: colors
    reason: Existing v0.9.6 source styles and compiled Tailwind theme remain canonical.
  - section: typography
    reason: Preserve calculator's existing inherited typography and game styles.
  - section: rounded
    reason: Existing component classes remain canonical; no redesign.
  - section: spacing
    reason: Existing responsive component classes remain canonical.
---

## Overview

This is a behavior-preserving extraction, not a redesign. Calculator's v0.9.6
shared core and calculator/public/games are the canonical baseline authorized
by the user. Mini-app-specific dialogue/data selection and SNAI routing live
under src/apps in this package; hosts provide current clients, data and routes.

## Colors

Runtime ownership: src/styles/index.css, src/pet/tailwind-entry.css and game CSS.
scripts/postbuild.mjs compiles and scopes the pet utilities. Do not hand-edit dist.

The shared UI is light-only, even when a host app or the operating system uses
dark mode. Use the selected cream pixel room artwork with light gradients as a fallback, white translucent HUD,
sidebar, menus, shadows and existing cat/AI palette. No alternate dark palette.
Runtime source styles remain canonical (Model B); postbuild generates a scoped
`pet-function-light-lock` cascade layer with important paint declarations copied
from those exact styles. This protects the shared UI from the seven hosts'
unlayered dark-mode overrides without changing their own themes or shared
geometry, drag positions and animation. Shared roots explicitly mark light mode.

## Typography

Keep existing host inheritance and per-game typography. No new font services.

## Layout

Room interaction hints use RoomInteractionOutlines.tsx: thin cream object contours,
mapped to rooms-wide artwork with centered cover cropping. No Click / Space plaques.
src/styles/index.css owns the 2px stroke and slow 3.2s opacity pulse; hover and
keyboard focus hold a steady contour. Each object opens its existing room menu.
Kitchen food and bathroom tool menus are non-modal top panels beside the map.
They never add a dimming or blur layer over the room, pet, stats, level, or coins,
and their desktop width stops before the centered stats panel.
Food, bathroom-tool, and game menus close from their close control, Escape, or a
second Space press; Space on a focused interactive control keeps that control's action.
Bathroom care reaches full lather after five paced soap rubs. A complete rinse then
adds 25 Clean points, so four soap-and-rinse cycles fill an empty Clean meter.
Bathroom, Kitchen, and Games doors share the same slow pulsing contour as other
room objects. Click activates the door directly; Space activates it only while the
cat is beside it. Bathroom leads to Bedroom, while Kitchen and Games lead Outside.
Shopping Street owns the purchase entry points. Its first storefront opens only
Healthy, Breakfast, Meals, Drinks, and Sweets; its second storefront opens only
Toys, Room Decor, and Fishing Rods. Their traced door contours are clickable, while Space opens the
nearby store when the cat is beside its entrance. The shop close control and
Escape first show a farewell. Space finishes the active line, then closes that
line on the next press; dismissing a farewell also closes the shop. Do not render a persistent global Shop
button or a Kitchen shortcut into the purchase catalog.
Town Home, Shopping Street, and Sports Ground use a compact status-panel toggle
at the top center. Its meter-and-chevron glyph must remain visually distinct
from the large block arrows used for scene travel.
Sports Ground keeps the return arrow beside the upper-left tree near the centered
approach road. The cat may walk only on that approach road and stops before the
stadium entrance; the track, field, seating, and stadium interior are blocked.
Town Home and Sports Ground retain their house, pond, shopping road, and stadium
approaches while adding dedicated side roads to the Karting Track. Town Home's
new road leaves from the east bank and Sports Ground's branch follows the garden
behind the stadium; both connect to the new pixel-art karting scene without
making the existing destinations or protected scenery walkable.
The Karting Track sits below Town Home and to the right of Sports Ground on the
travel map. Its top approach returns to Town Home and its left approach returns
to Sports Ground, with the race circuit kept decorative and fenced off.
The stadium's central arched entrance has a fitted pulsing preview contour. It is
visual-only until the future interior scene is implemented, so it must not accept
click, Space, Enter, or focus interaction yet.
The pond beside Town Home's wooden dock uses a traced shoreline contour. Clicking
the pond, or pressing Space while the cat is beside the dock, enters Fishing Pond.
The Fishing Pond and mole game use one game-return arrow at the upper-left corner:
Fishing Pond returns to Town Home, while the mole game returns to Outside.
These game scenes do not show the pet-page exit arrow; Fishing Pond also hides the
room map button. Keep each existing pixel scene-return arrow's artwork.
Fishing Pond places the dock at the bottom and the water above it, with the selected
cat represented by its own rear-view pixel sprite. The cat and fishing rod are
separate image layers: `petId` chooses one of six cat backs, while `equippedRodId`
chooses the rod, so future purchasable rods can replace the held equipment without
regenerating any cat artwork. Its fast power pointer stops on click or
Space: white has a 60% miss rate, while green awards 2-5 coins, orange 6-10, and red
10-20. Successful catches select one of six visibly different species: Pond Fish,
Perch, Catfish, Rainbow Trout, Koi Fish, or Golden Fish. White and green favor
common fish, orange introduces trout and koi, and red can award koi or the rare
Golden Fish. The exact species appears in the result and is added as its own item
in the existing Food inventory, where it can be fed to the pet.

Room artwork is owned by src/pet/internal/roomBackgrounds.ts and shipped from
public/pet-function/rooms through prepare-pet. The user's output folders supply the five selected images.
Outside maps to PLAYROOM (and the legacy GARDEN room). Render decorative artwork
behind all interactions with bottom-centered cover sizing and pixelated scaling.
Preserve pet movement, equipped beds, room controls and sleep dimming.
The interactive Outside ball renders at 120px with a matching 60px physics
radius so its enlarged pixel artwork stays fully inside the viewport.

Keep the fixed pet overlay, room navigation, landscape cleanup and game overlays.
Meowdoku opens above the pet and closes back to the still-mounted Games room.

## Elevation & Depth

Preserve v0.9.6 shadows, blur and z-index; no host-global styling changes.

## Shapes

Existing component classes are the shape token source.

## Components

ShoppingLayout.tsx reserves the left side for the selected cat's cashier artwork
and shifts every Shopping Street catalog to the right. The six three-frame WebP
sprites live in public/pet-function/shopkeepers; first blink is approximately
half a second after opening, then every 2.4 seconds. Reduced motion keeps the
open-eye frame. Narrow screens place the compact cashier above the catalog.
ShopDialogue.tsx owns the welcome, insufficient-coins, purchase and farewell
feedback. It reuses NpcDialogue's cream paper, brown border and pixel controls
from src/styles/index.css; no extra portrait or displayed name is added.
The shared useTypewriterDialogue controller reveals one grapheme every 28ms,
handles Space to skip/close, and dismisses three seconds after the full line.
The small dialogue above the cashier keeps purchase controls reachable.
Outdoor NPCs share this timing; their four authored game-entrance invitations
remain unchanged. Bedroom's My Wardrobe retains its existing centered layout
without a shopkeeper or shop greetings. It always lists purchased clothes and
jewelry only; catalog filter and Browse items controls appear only in shops.

Wardrobe shops use PixelShopDialog.tsx (viewport-bounded portal, focus trap,
Escape dismissal, inert siblings, focus restoration) and WardrobeShop.tsx.
The wardrobe variant reuses the pixel shop ink #5a351f, paper #fff8df,
header #f39a2e and turquoise focus/selection #238f83; src/styles/index.css
owns their --wardrobe-* mapping (Model B). Its body owns scrolling; header
and save status stay reachable. The portal sits at 1100 above the pet window's
1000 and mounts inside the fullscreen element when one is active.
Wardrobe purchases use the existing pet coin wallet, confirmed server receipts,
and independent per-cat body/neck slots. Try-on never mutates a saved outfit.
Pet.tsx renders all worn layers on the same 8x10 animation grid and restarts
the shared layer group when equipment changes so their animation phases agree.
Sky Sailor, Forest Vest and Royal Cape each use a complete imagegen-authored
cat atlas for all six cats, matching the Rose Knit 1536x2080 / 61-frame layout.
Their independent neck layers are pose-fitted to each garment atlas. Runtime
assets live in public/pet-function/wardrobe/clothing-v1; packing validation
fixtures live in tests/fixtures/art. Generated source images, prompts and
visual review captures are authoring artifacts, excluded from the package.
WardrobeClothingIcon.tsx owns the catalog's stepped pixel SVG artwork. Sky
Sailor shows its ivory short sleeves, blue piped sailor collar and necktie;
Forest Vest uses a sleeveless cut, brass buttons and leaf stitching; Royal
Cape uses a draped shoulder silhouette, gold trim and star embroidery. These
share Rose Knit's visual scale and pixel edges while reflecting the worn art.

SharedCatMascot owns visual display; shared app dialogue controllers own content.
SharedCatMascot also owns the global cat-bed control. It follows the visible
Tutorial trigger when present and otherwise the SNAI trigger. Activating it
locks page-driven movement immediately, walks the cat into bed, and holds the
sleep pose until that same control is activated again. The bed is a frameless
64px control matching the SNAI trigger. While sleeping, the cat scales into the
bed as a child of the bed control, follows it across route/layout changes, and
stops intercepting pointer input so the bed can wake it immediately. Keep the
bed slightly closer to the right edge than its Tutorial/SNAI anchor. Bed sleep
state is stored in the account's inventory_pet row and synchronized through
Supabase Realtime across all seven hosts. Keep dialogue mounted but hidden for
the whole sleep period so it can return when the cat wakes.
SharedVirtualPet owns pet rooms/runtime. SharedMeowdokuLauncher owns the game bridge.
Indoor cat movement uses room-specific floor depth offsets: kitchen -0.03 to 0.26,
bathroom 0.02 to 0.30, bedroom -0.08 to 0.15, and games -0.07 to 0.24.
Database clients, identities and business action executors remain host-owned.
SNAI services, adapters, welcome content, UI and fixed light styling are shared.
Server endpoints remain deployed per app; frontend sharing never bundles secrets.

## Do's and Don'ts

Room cosmetics use independent original-canvas overlays, never whole-room theme swaps.
Shopping > Room Decor shows complete Games/Bathroom/Bedroom/Kitchen background
thumbnails. Enter a room to choose a furniture category, then browse its skins.
Each room has curtains, a rug, and one special slot (console/toilet/bed/fridge).
The cream panels, orange header, brown pixel borders and teal selected filters reuse
the existing store visual language. Cabinets are a category inside each room and
retain their existing ownership and selection storage. The standalone Cabinets
and legacy pet Beds shelves are removed from Shopping. Bedroom's new bed skin
remains available under Room Decor > Bedroom > Beds. Navigation resets the list
scroll position so the next room/category starts at the top.
Generated assets retain 1862×845 coordinates; masks must be disjoint across slots,
including cabinets. Cosmetic layers have no pointer events or gameplay actions.
Region validation fixtures live in tests/fixtures/art/room-decor.json.

- Edit shared source/resources here; rebuild hosts after changes.
- Never add paid import services or move secrets into the shared package.
- Never infer a guest is a signed-in user or call database mutations during tests.
- Keep rollback sources until runtime verification is complete.
SNAI support shortcut: src/ai/SharedSNAISupportCard.tsx is the single owner.
SharedMolarAI renders it by default; all seven hosts omit bespoke footer cards.
The user's superapp screenshot is the SNAI color reference: white panel with
existing mint ambience, slate support card (#334155), emerald icon on deep green,
light slate composer and transparent input. This is one fixed palette, not a
dark-mode variant. src/styles/index.css owns these values under molar-chat-*
and snai-support-* selectors, included in the generated light-lock layer.
The panel must be opaque so dark host backgrounds cannot change its paint.
Preserve the Gmail compose target, copy, keyboard focus and hover behavior.
