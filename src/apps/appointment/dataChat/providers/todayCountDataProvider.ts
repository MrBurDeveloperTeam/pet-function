// Reuses Phase-2's own `computeAppointmentDailyState` UNCHANGED (see
// ../../utils/appointmentDailyState.ts) — the exact same active-status +
// local-today rule Daily Summary and No Appointments Today already rely
// on. `rooms` is passed as `[]` since a today count never depends on
// room occupancy (mirrors noAppointmentsTodayProvider.ts's own call
// shape) — this intent does NOT require a valid `end_time` on any row.
//
// MODEL-SAFE FACTS: `{appointmentCountToday}` — a single aggregate
// number, no appointment rows, no patient data.

import { computeAppointmentDailyState } from '../../utils/appointmentDailyState';
import type { DailyAppointmentLike } from '../../utils/appointmentDailyProjection';

export interface TodayCountDataFacts {
  appointmentCountToday: number;
}

export function buildTodayCountDataFacts(
  appointments: DailyAppointmentLike[],
  now: Date = new Date()
): { facts: TodayCountDataFacts; sourceRecordIds: string[] } {
  const state = computeAppointmentDailyState(appointments, [], now);
  return {
    facts: { appointmentCountToday: state.count },
    // Aggregate-only intent, no single backing record — matches the
    // established Summary-intent precedent (Inventory/To-Do).
    sourceRecordIds: [],
  };
}
