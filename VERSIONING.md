# Versioning

Every released pet-function change must update the version in package.json.
Use semantic versions: patch for compatible fixes and visual/content adjustments,
minor for backward-compatible features, and major for breaking host interfaces.
package-lock.json must carry the same root version. `npm test` enforces this.

Current prepared version: 0.12.0; publish it with the matching v0.12.0 tag.
Host dependencies should move to v0.12.0 after that tag and its resource Release exist.
The molar-experience v0.9.6 references in design and
migration documents identify the original extraction baseline; they are not the
current pet-function release number and should remain unchanged.
