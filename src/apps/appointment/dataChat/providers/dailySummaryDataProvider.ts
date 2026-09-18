// Composes today's count (Phase-2's own `computeAppointmentDailyState`,
// unchanged), the upcoming-within-2h count (this slice's own
// computeSoonAppointments.ts, same rule as Appointment Soon), and
// occupied-room count into ONE aggregate answer. Every number here is
// deterministic, reusing the identical eligibility/window/occupancy
// rules the other three intents already use — nothing is recomputed
// independently.
//
// Caller MUST check ../utils/checkAppointmentDataIntegrity.ts's
// `hasUnresolvableRoomOccupancy` BEFORE calling this — `occupiedRoomCount`
// here depends on the same occupancy rule Room Usage does, so an
// unresolvable row would silently undercount it, not just Room Usage's
// own answer.
//
// MODEL-SAFE FACTS: `{appointmentCountToday, upcomingWithinTwoHoursCount,
// occupiedRoomCount, nextAppointmentMinutes?}` — aggregate numbers only.
// No patient names, no staff names, no treatments, no notes, no staff
// leave (no per-staff leave model exists — see
// ../../resolver/resolveAppointmentInsight.ts's own header).

import { computeAppointmentDailyState } from '../../utils/appointmentDailyState';
import { computeSoonAppointments, compareSoonItems } from '../utils/computeSoonAppointments';
import type { DailyAppointmentLike, RoomLike } from '../../utils/appointmentDailyProjection';

export interface DailySummaryDataFacts {
  appointmentCountToday: number;
  upcomingWithinTwoHoursCount: number;
  occupiedRoomCount: number;
  /** Omitted when no appointment currently qualifies as "soon" — never
   *  a fabricated 0 or null. */
  nextAppointmentMinutes?: number;
}

export function buildDailySummaryDataFacts(
  appointments: DailyAppointmentLike[],
  rooms: RoomLike[],
  now: Date = new Date()
): { facts: DailySummaryDataFacts; sourceRecordIds: string[] } {
  const state = computeAppointmentDailyState(appointments, rooms, now);
  const soonItems = computeSoonAppointments(appointments, now);
  const nextAppointmentMinutes =
    soonItems.length > 0 ? [...soonItems].sort(compareSoonItems)[0].minutesUntilStart : undefined;

  const facts: DailySummaryDataFacts = {
    appointmentCountToday: state.count,
    upcomingWithinTwoHoursCount: soonItems.length,
    occupiedRoomCount: state.occupiedRooms.length,
    ...(nextAppointmentMinutes !== undefined ? { nextAppointmentMinutes } : {}),
  };

  return {
    facts,
    // Aggregate-only intent, no single backing record.
    sourceRecordIds: [],
  };
}
