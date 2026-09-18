// Reuses the exact same occupancy rule as Phase-2's
// `computeAppointmentDailyState` (../../utils/appointmentDailyState.ts):
// `start <= now < end` (end exclusive) against the authoritative
// `end_time` column, same `ELIGIBLE_STATUSES`, same per-room dedupe.
// Reimplemented here (not called through the aggregate helper) because
// Data Chat's room-usage ANSWER needs the backing appointment id and the
// occupancy interval per room — the aggregate helper only returns a
// room id/name pair, not enough to build `sourceRecordIds` or
// `startAt`/`endAt` facts. The RULE is identical; only the returned
// shape is richer.
//
// Caller MUST check ../utils/checkAppointmentDataIntegrity.ts's
// `hasUnresolvableRoomOccupancy` BEFORE calling this — a row this
// function silently skips (missing/malformed start/end) is
// indistinguishable here from "not occupied", which is exactly why that
// separate integrity gate exists (see resolveAppointmentDataQuery.ts).
//
// MODEL-SAFE FACTS: `{occupiedRoomCount, count, shownCount,
// rooms:[{roomName, startAt?, endAt?}]}` — room identity is clinic
// operational metadata, not patient identity, but `roomId` itself is
// still kept local-only (see sourceRecordIds) since only the display
// name is needed for phrasing.

import { buildClinicDeviceLocalAppointmentStart, getLocalDateKey, normalizeDateKey } from '../../utils/appointmentTime';
import type { DailyAppointmentLike, RoomLike } from '../../utils/appointmentDailyProjection';

const ELIGIBLE_STATUSES = new Set(['confirmed', 'pending']);
const MAX_LIST_ITEMS = 5;

function isEligibleStatus(status: unknown): status is string {
  if (typeof status !== 'string') return false;
  return ELIGIBLE_STATUSES.has(status.trim().toLowerCase());
}

interface OccupyingAppointment {
  appointmentId: string;
  roomId: string;
  roomName: string | null;
  start: Date;
  end: Date;
}

/** Deterministic same-type tie-break: room name (nulls sort first via
 *  empty-string coercion), then room id — never array/object iteration
 *  order. */
function compareOccupying(a: OccupyingAppointment, b: OccupyingAppointment): number {
  const an = a.roomName ?? '';
  const bn = b.roomName ?? '';
  if (an !== bn) return an < bn ? -1 : 1;
  return a.roomId < b.roomId ? -1 : a.roomId > b.roomId ? 1 : 0;
}

export interface RoomUsageItemFact {
  /** `null` when the room row is missing from the loaded rooms
   *  projection — never a fabricated placeholder like "Room". */
  roomName: string | null;
  startAt: string;
  endAt: string;
}

export interface RoomUsageDataFacts {
  occupiedRoomCount: number;
  count: number;
  shownCount: number;
  rooms: RoomUsageItemFact[];
}

export function buildRoomUsageDataFacts(
  appointments: DailyAppointmentLike[],
  rooms: RoomLike[],
  now: Date = new Date()
): { facts: RoomUsageDataFacts; sourceRecordIds: string[] } {
  const todayKey = getLocalDateKey(now);
  const seenRooms = new Set<string>();
  const occupying: OccupyingAppointment[] = [];

  for (const appt of appointments) {
    if (!appt.id) continue;
    if (!isEligibleStatus(appt.status)) continue;
    if (normalizeDateKey(appt.date) !== todayKey) continue;

    const roomId = typeof appt.roomId === 'string' && appt.roomId ? appt.roomId : null;
    if (!roomId || seenRooms.has(roomId)) continue;

    const start = buildClinicDeviceLocalAppointmentStart(appt.date, appt.startTime);
    const end = buildClinicDeviceLocalAppointmentStart(appt.date, appt.endTime);
    if (!start || !end) continue; // integrity gate upstream should have already caught this case

    if (start.getTime() <= now.getTime() && now.getTime() < end.getTime()) {
      seenRooms.add(roomId);
      const room = rooms.find((r) => r.id === roomId);
      const roomName = room && typeof room.name === 'string' && room.name.trim() ? room.name : null;
      occupying.push({ appointmentId: appt.id, roomId, roomName, start, end });
    }
  }

  const ordered = [...occupying].sort(compareOccupying);
  const shown = ordered.slice(0, MAX_LIST_ITEMS);

  const facts: RoomUsageDataFacts = {
    occupiedRoomCount: ordered.length,
    count: ordered.length,
    shownCount: shown.length,
    rooms: shown.map((o) => ({
      roomName: o.roomName,
      startAt: o.start.toISOString(),
      endAt: o.end.toISOString(),
    })),
  };

  return { facts, sourceRecordIds: shown.map((o) => o.appointmentId) };
}
