// Reuses the exact same "today" + eligible-status rule as every other
// Data Chat intent (`ELIGIBLE_STATUSES` = `confirmed`/`pending`, local
// clinic-device date match — see ../../utils/appointmentDailyState.ts's
// own header for why this is the one established active-status
// decision, never reinterpreted). Does NOT depend on `end_time` /
// room occupancy, so — like Today Count — this intent is exempt from
// ../utils/checkAppointmentDataIntegrity.ts's `hasUnresolvableRoomOccupancy`
// gate (see resolveAppointmentDataQuery.ts).
//
// NOT MODEL-SAFE FACTS — deliberately different from every other
// provider in this directory. `TodayScheduleDataFacts` resolves
// `patientId`/`dentistId`/`treatmentId` to display names using the
// app's own already-authorized `patients`/`staff`/`treatments` state
// (the same data App.jsx's own `aiContext`/Calendar views already read),
// which means these facts DO contain patient identity. They must NEVER
// be sent to Gemini for phrasing — appointmentsMolarAdapter.ts special-
// cases `appointment_today_list` to format this response directly via
// formatGroundedAppointmentFallback.ts, bypassing the Gemini grounded-
// phrasing call entirely. Every other intent in this directory keeps the
// zero-patient-PII-to-Gemini rule unchanged.
//
// A field is OMITTED (never a fabricated placeholder) whenever its id is
// missing or doesn't resolve against the currently-loaded
// patients/staff/treatments/rooms lists.

import { buildClinicDeviceLocalAppointmentStart, getLocalDateKey, normalizeDateKey } from '../../utils/appointmentTime';

const ELIGIBLE_STATUSES = new Set(['confirmed', 'pending']);
const MAX_LIST_ITEMS = 10;

// `isEligibleStatus`/`RawScheduleAppointment`/`projectRawScheduleAppointments`/
// `resolveName` are exported so nextAppointmentDataProvider.ts can reuse
// this exact same status/raw-projection/name-resolution logic verbatim
// instead of a second, potentially-drifting copy — both providers need
// identical patientId/dentistId/treatmentId/roomId -> name resolution
// over the same authorized local state.
export function isEligibleStatus(status: unknown): status is string {
  if (typeof status !== 'string') return false;
  return ELIGIBLE_STATUSES.has(status.trim().toLowerCase());
}

export interface RawScheduleAppointment {
  id: string;
  date: unknown;
  startTime: unknown;
  status: unknown;
  roomId: unknown;
  patientId: unknown;
  dentistId: unknown;
  treatmentId: unknown;
}

export function projectRawScheduleAppointments(appointments: unknown): RawScheduleAppointment[] {
  if (!Array.isArray(appointments)) return [];
  return appointments.map((raw) => {
    const source = (raw ?? {}) as Record<string, unknown>;
    return {
      id: source.id as string,
      date: source.date,
      startTime: source.startTime,
      status: source.status,
      roomId: source.roomId,
      patientId: source.patientId,
      dentistId: source.dentistId,
      treatmentId: source.treatmentId,
    };
  });
}

/** `id`/`name` lookup against any of `patients`/`staff`/`treatments`/
 *  `rooms` — every one of those already uses this exact shape elsewhere
 *  in this app (see App.jsx's own `.find(x => x.id === ...)?.name`
 *  usages this mirrors). Returns `undefined` (never a fabricated
 *  placeholder) when the id is missing or doesn't resolve. */
export function resolveName(id: unknown, list: unknown[]): string | undefined {
  if (typeof id !== 'string' || !id) return undefined;
  if (!Array.isArray(list)) return undefined;
  const found = list.find((raw) => {
    const rec = raw as Record<string, unknown> | null;
    return !!rec && rec.id === id;
  }) as Record<string, unknown> | undefined;
  if (!found || typeof found.name !== 'string' || !found.name.trim()) return undefined;
  return found.name;
}

interface ResolvedScheduleAppointment {
  id: string;
  start: Date;
  status: string;
  patientName?: string;
  treatmentName?: string;
  dentistName?: string;
  roomName?: string;
}

/** Deterministic same-type tie-break: earliest local start first, then
 *  appointment id — matches every other list intent in this directory
 *  (e.g. computeSoonAppointments.ts's own `compareSoonItems`), never
 *  array/object iteration order. */
function compareSchedule(a: ResolvedScheduleAppointment, b: ResolvedScheduleAppointment): number {
  const diff = a.start.getTime() - b.start.getTime();
  if (diff !== 0) return diff;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export interface TodayScheduleItemFact {
  /** Clinic-device-local ISO instant. */
  startAt: string;
  status: string;
  patientName?: string;
  treatmentName?: string;
  dentistName?: string;
  roomName?: string;
}

export interface TodayScheduleDataFacts {
  count: number;
  shownCount: number;
  appointments: TodayScheduleItemFact[];
}

export function buildTodayScheduleDataFacts(
  appointments: unknown[],
  rooms: unknown[],
  patients: unknown[],
  staff: unknown[],
  treatments: unknown[],
  now: Date = new Date()
): { facts: TodayScheduleDataFacts; sourceRecordIds: string[] } {
  const todayKey = getLocalDateKey(now);
  const raw = projectRawScheduleAppointments(appointments);

  const eligible: ResolvedScheduleAppointment[] = [];
  for (const appt of raw) {
    if (!appt.id) continue;
    if (!isEligibleStatus(appt.status)) continue;
    if (normalizeDateKey(appt.date) !== todayKey) continue;

    const start = buildClinicDeviceLocalAppointmentStart(appt.date, appt.startTime);
    if (!start) continue; // cannot place chronologically -- fail-closed, excluded (mirrors every other list intent's own per-row handling)

    eligible.push({
      id: appt.id,
      start,
      status: (appt.status as string).trim().toLowerCase(),
      patientName: resolveName(appt.patientId, patients),
      treatmentName: resolveName(appt.treatmentId, treatments),
      dentistName: resolveName(appt.dentistId, staff),
      roomName: resolveName(appt.roomId, rooms),
    });
  }

  const ordered = [...eligible].sort(compareSchedule);
  const shown = ordered.slice(0, MAX_LIST_ITEMS);

  const facts: TodayScheduleDataFacts = {
    count: ordered.length,
    shownCount: shown.length,
    appointments: shown.map((item) => ({
      startAt: item.start.toISOString(),
      status: item.status,
      ...(item.patientName ? { patientName: item.patientName } : {}),
      ...(item.treatmentName ? { treatmentName: item.treatmentName } : {}),
      ...(item.dentistName ? { dentistName: item.dentistName } : {}),
      ...(item.roomName ? { roomName: item.roomName } : {}),
    })),
  };

  return { facts, sourceRecordIds: shown.map((item) => item.id) };
}
