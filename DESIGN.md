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
Toys and Beds. Their traced door contours are clickable, while Space opens the
nearby store when the cat is beside its entrance. The shop closes from its close
control, Escape, or a second Space press. Do not render a persistent global Shop
button or a Kitchen shortcut into the purchase catalog.

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
