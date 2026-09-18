// Shared, safe name-sanitization logic. Extracted from the existing Welcome
// Back `[name]` interpolation in CatMascot so both the legacy DB-configured
// path and the new Phase 1A fixed fallback resolve names identically and
// never show a raw email address.

export interface DisplayNameSources {
  profileName?: string | null;
  profileFullName?: string | null;
  metaName?: string | null;
  email?: string | null;
}

export function resolveSafeDisplayName(input: DisplayNameSources): string | null {
  let displayName: string | null = input.profileName || input.profileFullName || null;
  if (!displayName) displayName = input.metaName || null;
  if (!displayName && input.email) displayName = input.email.split('@')[0];
  // Never show a raw email address, even if it came from profiles.name/full_name.
  if (displayName && displayName.includes('@')) displayName = displayName.split('@')[0];
  return displayName;
}

export function resolveSafeFirstName(input: DisplayNameSources): string | null {
  const full = resolveSafeDisplayName(input);
  if (!full) return null;
  const first = full.trim().split(/\s+/)[0];
  return first || null;
}
