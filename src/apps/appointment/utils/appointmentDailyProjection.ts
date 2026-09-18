// Separate, distinct runtime projection from projectAppointmentsForInsight
// (../utils/appointmentProjection.ts), which remains Appointment Soon's
// ONLY input and is deliberately left untouched by this file. Daily
// Summary / Room In Use need two additional operational fields —
// `endTime` (to know when a room's occupancy ends) and `roomId` (to know
// which room) — that Appointment Soon must never receive. Keeping this as
// its own function/type means widening the daily-summary projection can
// never silently widen Appointment Soon's least-privilege input.
//
// Still zero patient PII: `patientId`/`dentistId`/`treatmentId`/`notes`/
// `createdAt` (see datastore.supabase.appointments.js's `mapAppointment`)
// are present on the source objects but are never read here either.

export interface DailyAppointmentLike {
  id: string;
  date: unknown;
  startTime: unknown;
  endTime: unknown;
  status: unknown;
  roomId: unknown;
}

export function projectAppointmentsForDailySummary(appointments: unknown): DailyAppointmentLike[] {
  if (!Array.isArray(appointments)) return [];

  return appointments.map((raw) => {
    const source = (raw ?? {}) as Record<string, unknown>;
    return {
      id: source.id as string,
      date: source.date,
      startTime: source.startTime,
      endTime: source.endTime,
      status: source.status,
      roomId: source.roomId,
    };
  });
}

/** Rooms are operational (not patient) data, but still minimized to just
 *  `id`/`name` — full room objects (see datastore.supabase.rooms.js's
 *  `mapRoom`, which also carries `color`) are never passed through. */
export interface RoomLike {
  id: string;
  name: unknown;
}

export function projectRoomsForDailySummary(rooms: unknown): RoomLike[] {
  if (!Array.isArray(rooms)) return [];

  return rooms.map((raw) => {
    const source = (raw ?? {}) as Record<string, unknown>;
    return {
      id: source.id as string,
      name: source.name,
    };
  });
}
