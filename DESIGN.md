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
by the user. Mini-app-specific dialogue/data selection and routing stay local.

## Colors

Runtime ownership: src/styles/index.css, src/pet/tailwind-entry.css and game CSS.
scripts/postbuild.mjs compiles and scopes the pet utilities. Do not hand-edit dist.

## Typography

Keep existing host inheritance and per-game typography. No new font services.

## Layout

Keep the fixed pet overlay, room navigation, landscape cleanup and game overlays.
Meowdoku opens above the pet and closes back to the still-mounted Games room.

## Elevation & Depth

Preserve v0.9.6 shadows, blur and z-index; no host-global styling changes.

## Shapes

Existing component classes are the shape token source.

## Components

SharedCatMascot owns visual display; local dialogue controllers own content.
SharedVirtualPet owns pet rooms/runtime. SharedMeowdokuLauncher owns the game bridge.
Database clients, identities and repository adapters remain host-owned.

## Do's and Don'ts

- Edit shared source/resources here; rebuild hosts after changes.
- Never add paid import services or move secrets into the shared package.
- Never infer a guest is a signed-in user or call database mutations during tests.
- Keep rollback sources until runtime verification is complete.
