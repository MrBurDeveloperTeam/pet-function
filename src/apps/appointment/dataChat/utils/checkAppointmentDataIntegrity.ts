// Intent-specific integrity gate — deliberately NOT a single "one check
// blocks everything" helper. Appointment Soon and Today Count only ever
// depend on date/start_time/status (both fail closed per-row for
// malformed values, mirroring Phase-2's own established behavior — see
// computeSoonAppointments.ts and appointmentDailyState.ts). Room Usage
// and Daily Summary additionally depend on `end_time` to determine
// occupancy, and a row whose occupancy COULD affect the answer but can't
// be evaluated must never be silently dropped and reported as "not
// occupied" — that would be a false negative, not a truthful zero.
//
// live schema (verified via information_schema during the readiness
// pass): `appointments.date`/`start_time`/`end_time` are typed date/time
// columns, not free text — malformation is low-probability, so this
// check exists for defense-in-depth, not because evidence shows it
// happens routinely.

import { buildClinicDeviceLocalAppointmentStart, getLocalDateKey, normalizeDateKey } from '../../utils/appointmentTime';
import type { DailyAppointmentLike } from '../../utils/appointmentDailyProjection';

const ELIGIBLE_STATUSES = new Set(['confirmed', 'pending']);

function isEligibleStatus(status: unknown): status is string {
  if (typeof status !== 'string') return false;
  return ELIGIBLE_STATUSES.has(status.trim().toLowerCase());
}

/**
 * `true` when a today, active-status, room-assigned appointment exists
 * whose start/end time cannot be reliably parsed — i.e. its occupancy
 * status is genuinely UNKNOWN, not "not occupied". Rows with no room
 * assignment are irrelevant to occupancy and never trigger this (their
 * count is answerable from status+date alone).
 */
export function hasUnresolvableRoomOccupancy(
  appointments: DailyAppointmentLike[],
  now: Date = new Date()
): boolean {
  const todayKey = getLocalDateKey(now);

  for (const appt of appointments) {
    if (!appt.id) continue;
    if (!isEligibleStatus(appt.status)) continue;
    if (normalizeDateKey(appt.date) !== todayKey) continue;

    const roomId = typeof appt.roomId === 'string' && appt.roomId ? appt.roomId : null;
    if (!roomId) continue; // no room assignment — occupancy not applicable, not a failure

    const start = buildClinicDeviceLocalAppointmentStart(appt.date, appt.startTime);
    const end = buildClinicDeviceLocalAppointmentStart(appt.date, appt.endTime);
    if (!start || !end) return true; // relevant row, occupancy genuinely unknown
  }

  return false;
}
