// Reuses todayScheduleDataProvider.ts's own status/raw-projection/name-
// resolution logic verbatim (`isEligibleStatus`, `projectRawScheduleAppointments`,
// `resolveName`) — same `ELIGIBLE_STATUSES` (confirmed/pending), same
// clinic-device-local date/time construction (appointmentTime.ts), never
// a second conflicting definition of "today" or "eligible".
//
// NOT MODEL-SAFE FACTS — same deliberate exception as
// todayScheduleDataProvider.ts's own header: these facts resolve real
// patient/dentist/treatment identity from the app's own already-
// authorized `patients`/`staff`/`treatments` state, so they must NEVER
// be sent to Gemini for phrasing. appointmentsMolarAdapter.ts special-
// cases `appointment_next_appointment` (like `appointment_today_list`)
// to format this response directly via
// formatGroundedAppointmentFallback.ts, bypassing the Gemini grounded-
// phrasing call entirely.
//
// COVERAGE CAVEAT: like every other Data Chat intent, this only searches
// `appointments` already loaded into app state — App.jsx's own fetch
// window is roughly the previous month through the next month (see
// appointmentCoverage.ts's own header). A clinic with a genuine gap of
// more than ~1 month before its next appointment would not have that
// appointment loaded, and this would report "no upcoming appointments"
// even though one exists further out. This is the same inherent
// limitation every other Data Chat intent already has (all of them only
// ever read already-loaded state) — not a new one introduced here.

import { buildClinicDeviceLocalAppointmentStart, getLocalDateKey, normalizeDateKey } from '../../utils/appointmentTime';
import { isEligibleStatus, projectRawScheduleAppointments, resolveName } from './todayScheduleDataProvider';

export interface NextAppointmentItemFact {
  /** Clinic-device-local ISO instant. */
  startAt: string;
  status: string;
  patientName?: string;
  treatmentName?: string;
  dentistName?: string;
  roomName?: string;
}

export interface NextAppointmentDataFacts {
  /** Whether the question asked for today's remaining schedule only
   *  ("...today?") or the general next upcoming appointment — the
   *  formatter picks a different empty-state message for each. */
  todayOnly: boolean;
  /** Empty when no qualifying appointment exists. Normally length 1;
   *  length > 1 only on a genuine tie for the earliest upcoming start
   *  time (see compareEligible's own header) — never arbitrarily
   *  trimmed down to one in that case. */
  appointments: NextAppointmentItemFact[];
  /** Whether `appointments[0].startAt` (when present) falls on today's
   *  local calendar date — determines "today" vs "on <date>" phrasing. */
  isToday: boolean;
}

interface EligibleCandidate {
  id: string;
  start: Date;
  status: string;
}

/** Deterministic same-type tie-break: earliest local start first, then
 *  appointment id — identical convention to every other list intent in
 *  this directory (e.g. computeSoonAppointments.ts's own
 *  `compareSoonItems`), never array/object iteration order. */
function compareEligible(a: EligibleCandidate, b: EligibleCandidate): number {
  const diff = a.start.getTime() - b.start.getTime();
  if (diff !== 0) return diff;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function buildNextAppointmentDataFacts(
  appointments: unknown[],
  rooms: unknown[],
  patients: unknown[],
  staff: unknown[],
  treatments: unknown[],
  todayOnly: boolean,
  now: Date = new Date()
): { facts: NextAppointmentDataFacts; sourceRecordIds: string[] } {
  const todayKey = getLocalDateKey(now);
  const raw = projectRawScheduleAppointments(appointments);
  const rawById = new Map(raw.map((a) => [a.id, a] as const));

  const candidates: EligibleCandidate[] = [];
  for (const appt of raw) {
    if (!appt.id) continue;
    if (!isEligibleStatus(appt.status)) continue;
    if (todayOnly && normalizeDateKey(appt.date) !== todayKey) continue;

    const start = buildClinicDeviceLocalAppointmentStart(appt.date, appt.startTime);
    if (!start) continue; // cannot place chronologically -- fail-closed, excluded

    // "next" means start time >= now (Section 5) -- strictly-past
    // appointments are excluded, an appointment starting at this exact
    // instant is included.
    if (start.getTime() < now.getTime()) continue;

    candidates.push({ id: appt.id, start, status: (appt.status as string).trim().toLowerCase() });
  }

  if (candidates.length === 0) {
    return { facts: { todayOnly, appointments: [], isToday: false }, sourceRecordIds: [] };
  }

  candidates.sort(compareEligible);

  // Tie handling (Section 10): every candidate sharing the exact same
  // earliest start time is included, not just the first by id -- never
  // silently pick one patient out of a genuine collision.
  const earliestStart = candidates[0].start.getTime();
  const tied = candidates.filter((c) => c.start.getTime() === earliestStart);

  const items: NextAppointmentItemFact[] = tied.map((c) => {
    const original = rawById.get(c.id)!;
    return {
      startAt: c.start.toISOString(),
      status: c.status,
      patientName: resolveName(original.patientId, patients),
      treatmentName: resolveName(original.treatmentId, treatments),
      dentistName: resolveName(original.dentistId, staff),
      roomName: resolveName(original.roomId, rooms),
    };
  });

  const firstOriginal = rawById.get(tied[0].id)!;
  const facts: NextAppointmentDataFacts = {
    todayOnly,
    appointments: items,
    isToday: normalizeDateKey(firstOriginal.date) === todayKey,
  };

  return { facts, sourceRecordIds: tied.map((c) => c.id) };
}
