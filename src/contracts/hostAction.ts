/**
 * Replacement boundary for `window.__MOLAR_ACTIONS__`.
 *
 * The shared package must NEVER read or write any global `window` action
 * registry, and must never know a specific host's action vocabulary (e.g.
 * Appointments' ADD_APPOINTMENT/UPDATE_APPOINTMENT/etc.). Those concrete
 * action names/handlers are defined entirely by each host at migration
 * time — this file only defines the generic typed envelope.
 */
import type { HostActionDescriptor } from './ai';

export type HostActionResult = { ok: true } | { ok: false; error: string };

export interface HostActionAdapter {
  execute(action: HostActionDescriptor): Promise<HostActionResult>;
}
