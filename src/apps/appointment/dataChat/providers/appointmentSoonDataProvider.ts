// Pure evaluator over already-loaded state (no Supabase query). Reuses
// computeSoonAppointments.ts (identical eligibility/window/tie-break to
// Phase-2's appointmentSoonProvider.ts) to enumerate every qualifying
// appointment, not just the single proactive winner.
//
// MODEL-SAFE FACTS: `{count, shownCount, appointments:[{startAt, status,
// minutesUntilStart, roomName?}]}`. Deliberately EXCLUDES
// `appointmentId` (source identity kept local-only — see
// sourceRecordIds; it adds no phrasing value) and `roomId` (only the
// resolved display name, when known, is sent — never a raw room row).
// NO patient data was ever read here in the first place (this provider
// only ever touches id/date/startTime/status/roomId on the already-PII-
// stripped `DailyAppointmentLike` projection — see
// ../../utils/appointmentDailyProjection.ts).

import { computeSoonAppointments, compareSoonItems } from '../utils/computeSoonAppointments';
import type { DailyAppointmentLike, RoomLike } from '../../utils/appointmentDailyProjection';

const MAX_LIST_ITEMS = 5;

export interface AppointmentSoonItemFact {
  /** Clinic-device-local ISO instant. */
  startAt: string;
  status: string;
  minutesUntilStart: number;
  /** Omitted (not `null`) when the room row is missing from the loaded
   *  rooms projection — never a fabricated placeholder name. */
  roomName?: string;
}

export interface AppointmentSoonDataFacts {
  count: number;
  shownCount: number;
  appointments: AppointmentSoonItemFact[];
}

export function buildAppointmentSoonDataFacts(
  appointments: DailyAppointmentLike[],
  rooms: RoomLike[],
  now: Date = new Date()
): { facts: AppointmentSoonDataFacts; sourceRecordIds: string[] } {
  const items = computeSoonAppointments(appointments, now);
  const ordered = [...items].sort(compareSoonItems);
  const shown = ordered.slice(0, MAX_LIST_ITEMS);

  const facts: AppointmentSoonDataFacts = {
    count: items.length,
    shownCount: shown.length,
    appointments: shown.map((item) => {
      const room = item.roomId ? rooms.find((r) => r.id === item.roomId) : undefined;
      const roomName = room && typeof room.name === 'string' && room.name.trim() ? room.name : undefined;
      return {
        startAt: item.start.toISOString(),
        status: item.status,
        minutesUntilStart: item.minutesUntilStart,
        ...(roomName ? { roomName } : {}),
      };
    }),
  };

  return { facts, sourceRecordIds: shown.map((item) => item.appointmentId) };
}
