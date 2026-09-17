# @mrburdeveloperteam/pet-function

**Status: skeleton/foundation only.** This package does not yet contain
product UI and does not yet replace any of the seven Snabbb apps' existing
Cat Mascot / Molar AI / Virtual Pet implementations. It establishes the
public API surface, TypeScript contracts, build pipeline, and internal
module boundaries that later implementation phases will fill in.

## Purpose

Seven Snabbb apps (App Gallery, Inventory, To-Do, Appointments, E-Learning,
Profit Calculator, Content Studio) currently each maintain their own
near-identical copy of a Cat Mascot dialogue system, a Molar AI chatbox, and
a Virtual Pet mini-game. A 7-app architecture audit found these
implementations converge much more than they diverge — this package is the
future single implementation they will incrementally migrate onto.

## Architecture boundary

**This package owns:**
- Cat visual/runtime, dialogue lifecycle engine (Intro/Personalized/Welcome
  arbitration, mount-scoped shown-state, localStorage dismissal, cross-tab
  sync, exact-adopted-candidate binding, one-dialogue-per-activation)
- Molar AI chatbox UI and common chat lifecycle
- Virtual Pet UI *and* domain/business logic (decay, XP, shop, save/load)
- Shared assets (spritesheets, audio) and shared CSS
- Typed adapter contracts

**Hosts retain, always:**
- Dialogue candidate generation and priority ordering (Inventory's
  Expired/Low-Stock rules, To-Do's Overdue rules, App Gallery's cross-app
  aggregation, etc.) — the shared runtime never sorts a candidate pool
- App readiness signals
- Data-Driven Chat (deterministic intent classification, resolvers,
  grounded-facts phrasing) and General Chat orchestration
- App-specific Supabase business queries and mutations
- Routing/navigation implementation and route strings
- Authentication — hosts normalize their own auth into `MolarIdentity`

## Why the shared code never touches these things

Three concrete architecture decisions came out of the audit and are
enforced by the contracts in this package:

1. **No `window.__MOLAR_ACTIONS__`.** Only Appointments had a genuinely live
   implementation of this pattern (7 real Supabase-mutating actions); the
   same pattern was found to be fully dead code in three other apps. The
   shared package replaces it with a typed `HostActionAdapter.execute()`
   boundary — nothing in this package ever reads or writes `window`.
2. **No host router import.** `next/navigation`, `react-router-dom`, and
   `@tanstack/react-router` never appear in this package. CTA execution goes
   `DialogueAdapter.onAction(candidate)` — the host decides how to navigate,
   the shared Cat never knows.
3. **No host Supabase import in core/domain.** The Pet domain depends only
   on the `PetRepository` interface (`contracts/petRepository.ts`). A
   concrete Supabase-backed implementation is deliberately **not** included
   in this skeleton — see `src/pet/repository/README.md`.

## Installing this package

Published to GitHub Packages (not the public npm registry) under the
`@mrburdeveloperteam` scope — see `.github/workflows/publish-package.yml`.
A consuming app needs a `.npmrc` pointing that scope at GitHub Packages,
plus a token with `read:packages` scope (a classic PAT for local dev, or
the built-in `GITHUB_TOKEN` in CI):

```
@mrburdeveloperteam:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Then:

```
npm install @mrburdeveloperteam/pet-function
```

## Public imports

```ts
import { MolarExperienceProvider, MolarExperienceLayer } from '@mrburdeveloperteam/pet-function';
import { SharedCatMascot } from '@mrburdeveloperteam/pet-function/cat';
import { SharedMolarAI } from '@mrburdeveloperteam/pet-function/ai';
import { SharedVirtualPet } from '@mrburdeveloperteam/pet-function/pet';
import type { DialogueCandidate, PetStats, MolarExperienceConfig } from '@mrburdeveloperteam/pet-function/contracts';
import '@mrburdeveloperteam/pet-function/styles.css';
```

No other import path is supported — internal directories (`*/internal/`,
`pet/domain`, `pet/repository`, `pet/games`, `core/MolarExperienceContext`)
are not resolvable from outside the package (enforced via `package.json`
`"exports"`).

## Incremental adoption

Every domain is independently consumable. A host may adopt `SharedCatMascot`
while keeping its own local `MolarChat.jsx` and local `VirtualPet/` running
unmigrated — `MolarExperienceConfig`'s `dialogue`/`ai`/`hostActions`/
`petRepository` adapters are all optional except `appId`/`identity`,
specifically so a host only wires what it's actually migrating.

## Visual and business-logic baselines

- **Visual reference**: Content Studio. Its CSS custom-property theme
  (`--cp-*`, renamed `--molar-*` in this package) and glassmorphic/pixel-art
  treatment are the target look for the eventual Cat/Chat/Pet UI.
- **Virtual Pet business-logic baseline**: **not** Content Studio alone. A
  direct 7-repo source diff found Content Studio's `VirtualPetContainer.tsx`
  is missing a fullscreen/orientation-lock safety net that Appointments has
  (`handleCloseVirtualPet`). The audited baseline is a union: Appointments'
  `VirtualPetContainer` behavior (landscape/fullscreen support + the close
  safety net) plus Content Studio's `GameStateContext` (stricter
  `PricingItemRow`/`PetInventoryRow` typing). Neither app alone is the
  complete baseline.

## Global Pet direction

The product direction is one Virtual Pet per authenticated user across all
seven apps, keyed on a stable `globalUserId` (never a host's own
`localAppUserId`) — see `contracts/identity.ts` and
`contracts/petRepository.ts`. This package's contracts are shaped to support
that (e.g. `PetSaveSnapshot.updatedAt` is a first-class field because the
eventual merge policy is "latest valid `updated_at` wins as one coherent
row," with inventory conflicts resolved by `MAX(quantity)`, never `SUM`).
**No migration logic, merge logic, or production schema change is
implemented in this package.** That is future backend work, out of scope
here by design.

## What's NOT in this skeleton phase

- No product Cat/Chat/Pet UI (domain entry components render `null`)
- No Supabase-backed `PetRepository` implementation
- No copied Content Studio assets beyond one placeholder SVG proving the
  bundler-resolved asset-import mechanism
- No App Gallery changes (its sessionStorage "seen" mechanism and
  logout-clearing behavior are known, documented divergences — see the
  audit — fixed only when App Gallery is actually migrated)
- No migration of any of the seven existing apps
