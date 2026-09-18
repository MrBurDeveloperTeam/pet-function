// Enumerates ALL qualifying "soon" appointments (not just the single
// winner ../../providers/appointmentSoonProvider.ts selects for the
// proactive banner) — Data Chat needs a real count/list, not one
// candidate. Reuses the exact same eligibility rule, window, and
// tie-break as Phase-2 (same `ELIGIBLE_STATUSES`, same
// `APPOINTMENT_SOON_WINDOW_MS`, same clinic-device-local time
// construction) so the two can never silently diverge — this is a
// superset enumeration of the identical rule, not a second
// interpretation of it.
//
// Operates on `DailyAppointmentLike` (id/date/startTime/endTime/status/
// roomId — see ../../utils/appointmentDailyProjection.ts) rather than
// Phase-2's narrower `AppointmentLike`, since Data Chat's Appointment
// Soon answer also needs `roomId` to resolve a room name — Phase-2's own
// `AppointmentLike` type must not be widened for that (see that file's
// own "STRICT PRIVACY" header). `endTime` is present on the shared
// projection but unused here.

import { buildClinicDeviceLocalAppointmentStart } from '../../utils/appointmentTime';
import type { DailyAppointmentLike } from '../../utils/appointmentDailyProjection';

export const SOON_WINDOW_MS = 2 * 60 * 60 * 1000;

/** Identical to appointmentSoonProvider.ts's own ELIGIBLE_STATUSES and
 *  appointmentDailyState.ts's own — the one established active-status
 *  decision, never a fourth independent copy. */
const ELIGIBLE_STATUSES = new Set(['confirmed', 'pending']);

export interface SoonAppointmentItem {
  appointmentId: string;
  start: Date;
  status: string;
  minutesUntilStart: number;
  roomId: string | null;
}

function isEligibleStatus(status: unknown): status is string {
  if (typeof status !== 'string') return false;
  return ELIGIBLE_STATUSES.has(status.trim().toLowerCase());
}

/** `0 < start - now <= 2h` — identical boundary behavior to Phase-2:
 *  exactly at start (0 minutes) is excluded (already started/exactly
 *  now), exactly at the 2-hour mark (120 minutes) is included, one
 *  minute past (121) is excluded. */
export function computeSoonAppointments(
  appointments: DailyAppointmentLike[],
  now: Date = new Date()
): SoonAppointmentItem[] {
  const items: SoonAppointmentItem[] = [];

  for (const appt of appointments) {
    if (!appt.id) continue;
    if (!isEligibleStatus(appt.status)) continue;

    const start = buildClinicDeviceLocalAppointmentStart(appt.date, appt.startTime);
    if (!start) continue; // malformed/missing date-time — silently excluded, mirrors Phase-2's own fail-closed per-row behavior, not an integrity failure

    const differenceMs = start.getTime() - now.getTime();
    if (differenceMs <= 0) continue;
    if (differenceMs > SOON_WINDOW_MS) continue;

    items.push({
      appointmentId: appt.id,
      start,
      status: (appt.status as string).trim().toLowerCase(),
      minutesUntilStart: Math.round(differenceMs / 60_000),
      roomId: typeof appt.roomId === 'string' && appt.roomId ? appt.roomId : null,
    });
  }

  return items;
}

/** Deterministic same-type tie-break: earliest local start first, then
 *  appointment id — identical to Phase-2's own `compareForSelection`.
 *  Never array/object iteration order. */
export function compareSoonItems(a: SoonAppointmentItem, b: SoonAppointmentItem): number {
  const diff = a.start.getTime() - b.start.getTime();
  if (diff !== 0) return diff;
  return a.appointmentId < b.appointmentId ? -1 : a.appointmentId > b.appointmentId ? 1 : 0;
}
