// Shared deterministic "today" computation reused by BOTH
// appointmentDailySummaryProvider.ts and noAppointmentsTodayProvider.ts,
// so today's eligible count and current room occupancy are derived by
// exactly one piece of logic — never reimplemented twice where the two
// copies could silently drift apart (e.g. one provider's status set
// changing without the other's).
//
// Status eligibility mirrors appointmentSoonProvider.ts's own
// ELIGIBLE_STATUSES exactly (`confirmed`, `pending`) — the same
// established active-status decision, not a second independent
// interpretation. `completed`/`cancelled`/`no-show` never count toward
// today's count and never mark a room occupied.

import { buildClinicDeviceLocalAppointmentStart, getLocalDateKey, normalizeDateKey } from './appointmentTime';
import type { DailyAppointmentLike, RoomLike } from './appointmentDailyProjection';

const ELIGIBLE_STATUSES = new Set(['confirmed', 'pending']);

function isEligibleStatus(status: unknown): status is string {
  if (typeof status !== 'string') return false;
  return ELIGIBLE_STATUSES.has(status.trim().toLowerCase());
}

export interface OccupiedRoom {
  roomId: string;
  /** `null` when the room row is missing from the currently-loaded rooms
   *  projection — occupancy is still counted (it's known from `roomId`
   *  alone), but a display name must never be fabricated. Structured
   *  facts intentionally do NOT reuse CalendarView.jsx's generic `'Room'`
   *  UI fallback — that's a display-layer convenience for a labeled
   *  chip, not a truthful fact about which room this is. */
  roomName: string | null;
}

export interface AppointmentDailyState {
  date: string;
  count: number;
  occupiedRooms: OccupiedRoom[];
}

/** Deterministic same-type tie-break for the occupied-room list: room id
 *  (the only field guaranteed present — `roomName` may be `null`). Never
 *  array/object iteration order. */
function compareOccupiedRoom(a: OccupiedRoom, b: OccupiedRoom): number {
  return a.roomId < b.roomId ? -1 : a.roomId > b.roomId ? 1 : 0;
}

/**
 * `count`: eligible-status appointments whose `date` is local today —
 * independent of room assignment (an appointment with no room still
 * counts toward today's total).
 *
 * `occupiedRooms`: distinct rooms an eligible today appointment is
 * currently inside, using `start <= now < end` (end EXCLUSIVE — at the
 * exact end time the room is no longer in use). `endTime` is this app's
 * own authoritative schema column (`appointments.end_time`, mapped
 * straight through by datastore.supabase.appointments.js — never a
 * guessed/default duration). An appointment with a missing or malformed
 * `endTime` cannot have its occupancy determined and is simply excluded
 * from `occupiedRooms` (fail-closed per-row) — it still counts toward
 * `count` above, since that only depends on status + date, not room/time.
 * A room missing from the passed-in `rooms` list is still counted as
 * occupied (the occupancy itself is known from `roomId` alone) but its
 * `roomName` is `null` — never a fabricated placeholder like `'Room'` or
 * `'Unknown Room'`. Structured facts must stay truthful even where a
 * display-only UI fallback (e.g. CalendarView.jsx's own generic `'Room'`
 * chip label) would be acceptable.
 */
export function computeAppointmentDailyState(
  appointments: DailyAppointmentLike[],
  rooms: RoomLike[],
  now: Date = new Date()
): AppointmentDailyState {
  const todayKey = getLocalDateKey(now);
  let count = 0;
  const occupiedRoomIds = new Set<string>();
  const occupiedRooms: OccupiedRoom[] = [];

  for (const appt of appointments) {
    if (!appt.id) continue;
    if (!isEligibleStatus(appt.status)) continue;
    if (normalizeDateKey(appt.date) !== todayKey) continue;

    count += 1;

    const roomId = typeof appt.roomId === 'string' && appt.roomId ? appt.roomId : null;
    if (!roomId || occupiedRoomIds.has(roomId)) continue;

    const start = buildClinicDeviceLocalAppointmentStart(appt.date, appt.startTime);
    const end = buildClinicDeviceLocalAppointmentStart(appt.date, appt.endTime);
    if (!start || !end) continue; // no reliable end time — occupancy cannot be determined

    if (start.getTime() <= now.getTime() && now.getTime() < end.getTime()) {
      occupiedRoomIds.add(roomId);
      const room = rooms.find((r) => r.id === roomId);
      const roomName = room && typeof room.name === 'string' && room.name.trim() ? room.name : null;
      occupiedRooms.push({ roomId, roomName });
    }
  }

  occupiedRooms.sort(compareOccupiedRoom);

  return { date: todayKey, count, occupiedRooms };
}
