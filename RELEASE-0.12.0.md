# 0.12.0 — local release preparation

This minor release adds personal preset sayings to the floating cat in all seven
mini-app adapters, using the existing AIBoard Meow Dialogue configuration.

- Adds shared account-scoped ambient text, five state categories, existing
  built-in fallback lines, configured timing and repeat avoidance. Welcome
  sequences and business reminders keep priority; pet-room dialogue is separate.
- Links directly to the original deployed AIBoard for editing; the mini apps
  reuse its saved configuration without mounting a replacement editor.
- Guards account changes, concurrent edits/deletes and uncertain insert retries.
  Focus/visibility and background refresh synchronize confirmed sayings.
- Reuses existing tables. The user has supplied successful results from the
  manual permission repair; no database migration is run by package installation.
- Requires the companion aiboard selective-save changes to ship as well. Its
  old delete-all/reinsert persistence can erase concurrent additions.

The new optional mascot prop and exported hook/types are backward compatible.
The resource manifest and Release tag are regenerated for 0.12.0 / v0.12.0.
Room/game assets continue to use the existing independent resource packs.

## Validation and rollout

Passed the full JavaScript/declaration/CSS/resource build with declaration checking.
Passed 36 resource delivery/package guard tests and the package/lock version check.
Both generated manifests identify 0.12.0 / v0.12.0; all 467 resource files are
covered by 22 packs / 22 parts (256.66 MiB total; each part at most 64 MiB).
The npm pack dry-run verifies a 25.20 MiB core package against the 64 MiB budget.
Feature verification passed 83 targeted tests across pet-function and aiboard,
plus 103 isolated PostgreSQL permission checks. Browser verification covered
CRUD, failures, account changes, orphaned-draft recovery, keyboard and narrow layout.
Live signed-in CRUD and cross-app identity matching remain to be verified.

Prepared locally. No commit, tag, push, remote publication or host dependency
upgrade is included. Publish the matching version tag/resources first; then
update and lock the dependency in each of the seven hosts. AIBoard is a separate
Vercel application and does not need the library's package version to deploy.
