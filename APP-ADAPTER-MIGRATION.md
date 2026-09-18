# App-aware pet migration — local 0.9.11 pilot

## Appointment extension — unpublished 0.9.12

Appointment now has full app-aware dialogue/runtime wiring, data-chat orchestration,
the existing proactive clock hook, simulator config, mascot and visit/currency logic
in src/apps/appointment/ and src/apps/AppointmentCatMascot.jsx. Its 35 old host modules
are comments plus thin wiring. Existing patient-local answers, mutation refusal,
account/clinic boundaries and host server transports are preserved.

The host manifest targets GitHub v0.9.12 (no file: dependency). This tag does not
exist yet; its lockfile still uses v0.9.10. Local verification used a temporary npm
pack installation without writing a local dependency or changing its lockfile.
Publish the new source/tag, then npm install in Appointment and reverify before deployment.
Local build/typecheck, 78 host tests, 28 package tests and 82 game comparisons passed.
The historical 0.9.11 status below describes the preceding Inventory phase.

The package knows each migrated app's pet database mapping through explicit factories
in `src/apps/repositories/`. Supply the app's existing authenticated Supabase client;
do not put credentials or service-role keys in this package. Existing per-app account
identities, query filters and error behavior are preserved, not globally merged.

## Currently connected

Inventory is the only host connected to the new app-aware APIs. Its reminder rules,
grounded/general dialogue orchestration, follow-up memory, deterministic action proposals,
mascot runtime, simulator configuration reads, visit/currency lookup and pet repository
are shared. Old host implementations are comments, not executable alternatives.
Host authentication, business data loading, AI server transports and confirmed real stock
execution remain host-owned dependencies. No database schema/RLS/online record was changed.

## Prepared, not connected

The other six pet repository factories (superapp, appointment, calculator, todo, elearning,
image-generator) are exported from `@mrburdeveloperteam/pet-function/apps`.
Reminder rules for appointment/calculator/todo/elearning/image-generator also have app entries.
Those six hosts have NOT switched their app-specific data/dialogue wiring to these new APIs.
Superapp's cross-app business dialogue and the other apps' full AI orchestration still need migration.
Their previously shared pet UI/resources/games are unaffected.

## Verification and release

Build this package first (`npm run build`), then Inventory (`npm run build`), then run
`npm test` here and `npm run verify:pet` in Inventory. Tests use mocked clients/transports,
compare Inventory reminders against preserved originals, and compare all four games'
build output against canonical package assets. Real sign-in, account switches, currencies,
care/wallet persistence, contextual dialogue and game rewards still need manual acceptance.

Inventory was verified using `file:../pet-function`. Its manifest now targets
`github:mrburdeveloperteam/pet-function#v0.9.11`, but that remote tag does not exist yet.
The lockfile and installed dependency still reflect the local verification stage.
Publish/push the new source and tag, then run npm install in Inventory to regenerate
the lockfile and replace the local installation before repeating verification/deploying.
Do not treat the existing node_modules or build output as proof of a published install.
Publishing/committing/pushing is user-controlled.
The source changes here introduce no new paid import operation, service or AI calls.
