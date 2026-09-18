// Deterministic dispatcher: approved intent -> pure grounded provider ->
// GroundedDataResult. No Supabase query here — reuses the exact same
// `appointments`/`rooms` state App.jsx already owns (via useDataStore),
// passed in by the caller.
//
// READINESS: `appointmentDataStatus !== 'ready'` short-circuits to
// `status: 'unavailable'` BEFORE any provider runs — unknown appointment
// state is never reinterpreted as a zero-result answer.
//
// COVERAGE: reuses Phase-2's own `isTodayCoveredByDateRange` (see
// ../../utils/appointmentCoverage.ts) but evaluates it against the
// SUCCESSFULLY LOADED range (see src/hooks/useDataStore.js's
// `loadedAppointmentRange`), not the currently-requested calendar range
// — a range change in flight must never authorize an answer against
// stale prior data before the new fetch actually completes.
//
// INTEGRITY: Room Usage and Daily Summary additionally require
// `hasUnresolvableRoomOccupancy` to pass (see
// ../utils/checkAppointmentDataIntegrity.ts) — Appointment Soon and
// Today Count do not, since neither depends on `end_time`.

import { isTodayCoveredByDateRange, type DateRangeLike } from '../../utils/appointmentCoverage';
import { projectAppointmentsForDailySummary, projectRoomsForDailySummary } from '../../utils/appointmentDailyProjection';
import { hasUnresolvableRoomOccupancy } from '../utils/checkAppointmentDataIntegrity';
import { buildAppointmentSoonDataFacts } from '../providers/appointmentSoonDataProvider';
import { buildTodayCountDataFacts } from '../providers/todayCountDataProvider';
import { buildRoomUsageDataFacts } from '../providers/roomUsageDataProvider';
import { buildDailySummaryDataFacts } from '../providers/dailySummaryDataProvider';
import { buildTodayScheduleDataFacts } from '../providers/todayScheduleDataProvider';
import { buildNextAppointmentDataFacts } from '../providers/nextAppointmentDataProvider';
import type { AppointmentDataIntent, AppointmentDataStatus, GroundedDataResult } from '../contracts/groundedDataResult';

export function resolveAppointmentDataQuery(
  intent: AppointmentDataIntent,
  appointments: unknown[],
  rooms: unknown[],
  appointmentDataStatus: AppointmentDataStatus,
  loadedAppointmentRange: DateRangeLike | null | undefined,
  // Only `appointment_today_list`/`appointment_next_appointment` read
  // these — every other intent continues to run on the PII-stripped
  // `dailyAppointments`/`roomsProjected` projections below. Defaulted to
  // `[]` so every existing call site (none of which pass these) keeps
  // compiling and behaving identically.
  patients: unknown[] = [],
  staff: unknown[] = [],
  treatments: unknown[] = [],
  // Only `appointment_next_appointment` reads this — see
  // classifyAppointmentDataIntent.ts's own `todayOnly` field.
  todayOnly: boolean = false
): GroundedDataResult<unknown> {
  const evaluatedAt = new Date().toISOString();

  if (appointmentDataStatus === 'loading') {
    return { status: 'unavailable', intent, reasonCode: 'loading', evaluatedAt };
  }
  if (appointmentDataStatus === 'error') {
    return { status: 'unavailable', intent, reasonCode: 'data_error', evaluatedAt };
  }
  if (!isTodayCoveredByDateRange(loadedAppointmentRange)) {
    return { status: 'unavailable', intent, reasonCode: 'coverage_unavailable', evaluatedAt };
  }

  try {
    const now = new Date();
    // Same runtime PII-minimization projections Phase-2 already uses —
    // reused as-is, not reimplemented (see appointmentDailyProjection.ts).
    const dailyAppointments = projectAppointmentsForDailySummary(appointments);
    const roomsProjected = projectRoomsForDailySummary(rooms);

    switch (intent) {
      case 'appointment_soon': {
        const { facts, sourceRecordIds } = buildAppointmentSoonDataFacts(dailyAppointments, roomsProjected, now);
        return { status: 'ok', intent, facts, evaluatedAt, sourceRecordIds };
      }
      case 'appointment_today_count': {
        const { facts, sourceRecordIds } = buildTodayCountDataFacts(dailyAppointments, now);
        return { status: 'ok', intent, facts, evaluatedAt, sourceRecordIds };
      }
      case 'appointment_room_usage': {
        if (hasUnresolvableRoomOccupancy(dailyAppointments, now)) {
          return { status: 'unavailable', intent, reasonCode: 'evaluation_error', evaluatedAt };
        }
        const { facts, sourceRecordIds } = buildRoomUsageDataFacts(dailyAppointments, roomsProjected, now);
        return { status: 'ok', intent, facts, evaluatedAt, sourceRecordIds };
      }
      case 'appointment_daily_summary': {
        if (hasUnresolvableRoomOccupancy(dailyAppointments, now)) {
          return { status: 'unavailable', intent, reasonCode: 'evaluation_error', evaluatedAt };
        }
        const { facts, sourceRecordIds } = buildDailySummaryDataFacts(dailyAppointments, roomsProjected, now);
        return { status: 'ok', intent, facts, evaluatedAt, sourceRecordIds };
      }
      case 'appointment_today_list': {
        // Deliberately NOT `dailyAppointments`/`roomsProjected` — this is
        // the one intent that needs patientId/dentistId/treatmentId to
        // resolve display names, so it runs on the raw `appointments`/
        // `rooms` params directly (see todayScheduleDataProvider.ts's own
        // "NOT MODEL-SAFE FACTS" header for why that's safe here: this
        // intent's facts are never sent to Gemini). Does not depend on
        // `end_time`, so no `hasUnresolvableRoomOccupancy` gate — same
        // exemption as `appointment_today_count`.
        const { facts, sourceRecordIds } = buildTodayScheduleDataFacts(appointments, rooms, patients, staff, treatments, now);
        return { status: 'ok', intent, facts, evaluatedAt, sourceRecordIds };
      }
      case 'appointment_next_appointment': {
        // Same raw-data + PII-resolution rationale as `appointment_today_list`
        // directly above — see nextAppointmentDataProvider.ts's own "NOT
        // MODEL-SAFE FACTS" header. Does not depend on `end_time`, so no
        // `hasUnresolvableRoomOccupancy` gate — same exemption as
        // `appointment_today_count`/`appointment_today_list`.
        const { facts, sourceRecordIds } = buildNextAppointmentDataFacts(
          appointments,
          rooms,
          patients,
          staff,
          treatments,
          todayOnly,
          now
        );
        return { status: 'ok', intent, facts, evaluatedAt, sourceRecordIds };
      }
      default: {
        // Exhaustiveness guard — caught below like any other evaluation
        // failure if AppointmentDataIntent is ever widened without
        // updating this switch.
        throw new Error(`Unhandled AppointmentDataIntent: ${intent as string}`);
      }
    }
  } catch (err) {
    console.warn('[dataChat] appointment data query evaluation failed:', err);
    return { status: 'unavailable', intent, reasonCode: 'evaluation_error', evaluatedAt };
  }
}
