/** A successful empty result cannot override a confirmed account-scoped choice. */
export function confirmAdoptionIdentity(remoteName: string | null | undefined, cachedName: string | null, cachedConfirmed: boolean) {
  if (remoteName?.trim()) return remoteName;
  if (cachedName && cachedConfirmed) throw new Error('Saved pet choice could not be confirmed. Please retry; existing choice was preserved.');
  return null;
}
