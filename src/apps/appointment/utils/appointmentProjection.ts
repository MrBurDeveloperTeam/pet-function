// Runtime PII minimization boundary between App.jsx's existing full
// appointment objects (which carry patientId/dentistId/roomId/
// treatmentId/notes/createdAt — see datastore.supabase.appointments.js's
// mapAppointment) and the AI Experience pipeline.
//
// `AppointmentLike` (see ../providers/appointmentSoonProvider.ts) already
// declared only four fields, but TypeScript structural typing does not
// strip properties at runtime — passing the original appointment objects
// through a narrower TYPE does not remove patient data from the actual
// object references the provider receives. This function performs a real
// runtime projection: it builds brand-new plain objects containing only
// the four operational fields, so the provider is physically incapable of
// reading anything else, regardless of what the source objects contain.
//
// Called once, at the hook layer, before anything is handed to the
// resolver/provider — see ../hooks/useAppointmentPersonalizedInsight.ts.

import type { AppointmentLike } from '../providers/appointmentSoonProvider';

export function projectAppointmentsForInsight(appointments: unknown): AppointmentLike[] {
  if (!Array.isArray(appointments)) return [];

  return appointments.map((raw) => {
    const source = (raw ?? {}) as Record<string, unknown>;
    return {
      id: source.id as string,
      date: source.date,
      startTime: source.startTime,
      status: source.status,
    };
  });
}
