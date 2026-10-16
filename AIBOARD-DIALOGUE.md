# Personal floating-cat sayings

The supplied Vercel URL belongs to
[MrBurDeveloperTeam/aiboard](https://github.com/MrBurDeveloperTeam/aiboard),
not AI-Dashboard. Its Meow Dialogue configuration is reused by all seven
pet-function mascot adapters. No language model, additional AI API key or new
database table is introduced. Existing table permissions need the manual repair below.

Dialogue is edited on the original AIBoard's **Meow Dialogue** page. The mini apps
render no settings/filter button, AIBoard link or replacement editor beside the cat.
Add text under Normal, Hungry, Unhappy, Dirty or Low Energy. Existing
automatic lines remain available. The same authenticated Supabase user and
project must be used by AIBoard and each host; different account IDs cannot share
private presets. AIBoard audio and host business reminders keep their own flows.

## Data contract and read-only verification

Existing tables:

| Table | Purpose |
| --- | --- |
| aiboard_meow_configs | One configuration per user_id |
| aiboard_meow_messages | UUID id, config_id, state, message, is_audio, audio_name, sort_order |
| aiboard_meow_timing | UUID id, config_id, state, duration/interval minutes, disabled, updated_at |

RLS must restrict config rows to auth.uid() = user_id, and child rows to a config
owned by that user. Authenticated SELECT/INSERT/UPDATE/DELETE privileges and
corresponding policies are required. Never expose a service-role key in a host.

Run [the combined metadata-only audit](database/aiboard_meow_presets_summary_readonly.sql) in the
correct project's Supabase SQL Editor. It reads columns, keys, policies and
grants; it does not read personal messages or mutate data. The user's full
2026-10-16 audit confirms matching fields, UUID primary keys, config user_id
uniqueness, child foreign keys and enabled RLS. It also exposes a privacy defect:
all three public_read_meow_* SELECT policies use true for PUBLIC, allowing all
rows through despite owner_all. Anonymous/authenticated roles have excessive
table privileges. The manual [permission repair](database/aiboard_meow_presets_private.sql)
removes those three public-read policies, anonymous/PUBLIC table grants and
unneeded authenticated privileges. Existing owner policies and team_readonly
administrative access remain. The user subsequently supplied the repair's three
result rows with all five checks true, confirming successful policy/permission
repair at that time. It changed no saved messages and was not run remotely by
the agent. Actual cross-app identity matching and signed-in end-to-end checks
remain to be verified; local fake-client tests do not certify the live integration.

The manual permission repair passed 103 isolated PostgreSQL checks in
scripts/check-meow-presets-sql.mjs: repeat application, owner CRUD, cross-account
read/write isolation, anonymous rejection, preserved team_readonly/service_role
access, PUBLIC-derived grants, and rollback when inherited privileges remain.
The final result returns three rows with five boolean checks all true. This is
local SQL verification; the separate user-provided result confirms remote application.

## Changes that must ship together

1. Publish pet-function 0.12.1 / v0.12.1 with its new shared mascot logic and stylesheet.
2. Update all seven host apps to that package revision using their normal release
   process. Snabb's opt-in local alias can preview the sibling package meanwhile.
3. Ship the companion local aiboard changes: selective row persistence, guarded
   conflicts, UUID retry recovery, serialized saves, save status and account-keyed
   dashboard. Its old delete-all/reinsert save path could erase concurrently
   added presets if it remains deployed.

No remote database changes, Git commits, pushes or deployments were performed
as part of this feature implementation. Cross-origin hosts refresh on focus or
within 60 seconds; same-origin tabs also receive a refresh notification. Opening
the original AIBoard does not share login sessions across origins automatically;
sign in with the same account in each app. Private text is never placed into browser
storage or BroadcastChannel payloads (only the account ID is broadcast).

## Isolated browser preview

From pet-function, with the sibling Snabb host's installed Vite:

```powershell
node ../snabb-superapp/node_modules/vite/bin/vite.js --config tests/browser/vite.config.mjs --host 127.0.0.1 --port 3002 --strictPort
```

Open http://127.0.0.1:3002/meow-presets.html. This fixture uses in-memory rows
and visible controls for failures, slow responses and account changes. It does
not initialize a Supabase client, read the host's login or save real messages.
It is excluded from the published package. Build pet-function first for styles.
