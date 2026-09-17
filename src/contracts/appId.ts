/**
 * Stable identifier for each Snabbb app that may consume this package.
 *
 * This exists for experience identity, dismissal-storage namespacing, and
 * future diagnostics/telemetry only. It intentionally carries no business
 * priority or ordering meaning — that stays entirely host-owned.
 */
export type SnabbbAppId =
  | 'app-gallery'
  | 'inventory'
  | 'todo'
  | 'appointments'
  | 'elearning'
  | 'profit-calculator'
  | 'content-studio';
