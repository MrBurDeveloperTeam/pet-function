/**
 * Framework-neutral, auth-provider-neutral user identity.
 *
 * This package must never import a Supabase `User` type, a Next.js session
 * type, or any router/session library type. Hosts normalize their own
 * authentication state into this shape before passing it to
 * `MolarExperienceProvider`.
 */
export interface MolarIdentity {
  /**
   * Stable identity shared across ALL seven Snabbb apps (e.g. an SSO
   * subject). Reserved for the FUTURE canonical global-pet merge policy —
   * NOT used by the Pet domain yet (see `localAppUserId` below for what it
   * uses today). Introducing real `globalUserId` persistence semantics is
   * explicitly out of scope until a canonical global-pet backend exists.
   */
  globalUserId: string;

  /**
   * The host app's OWN local project identity (e.g. that app's Supabase
   * auth uuid). Used for per-app dialogue dismissal storage keys, AND
   * (since Phase 3D) this is the id the Pet domain keys on too —
   * `SharedVirtualPet` passes this straight through to `PetRepository`
   * calls as an opaque string, unchanged, exactly matching Content
   * Studio's own current `userId` (its Supabase auth uuid) today. This
   * keeps Pet persistence scoped to each host's own existing database,
   * with zero new cross-app identity coupling.
   */
  localAppUserId?: string;

  displayName?: string;

  /** Only present if a shared UI genuinely needs to render it (e.g. a
   *  Welcome Back name-token substitution fallback). */
  email?: string;

  isAuthenticated: boolean;
}
