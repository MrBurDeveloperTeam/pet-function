// Pure evaluator over the already-loaded `appointments` array App.jsx
// already owns (via useDataStore) — no Supabase query here. `appointments`
// is fetched for a [previous month, next month] window keyed off the
// calendar's own `currentDate` (see App.jsx's dateRange effect), which on
// initial mount (and while browsing the current month) always includes
// today — sufficient for a same-day "within 2 hours" rule. See this
// feature's implementation report for the documented limitation: if the
// user navigates the calendar to a distant month, `appointments` may no
// longer include today's rows, and this candidate would not evaluate
// correctly until they return — an accepted tradeoff of reusing existing
// state rather than adding a second, duplicate appointments query.
//
// Eligibility mirrors the Gallery reference's validated Appointment Within
// 2 Hours rule: 0 < start - now <= 2 hours, clinic-device-local time (see
// ../utils/appointmentTime.ts).
//
// Status eligibility is NOT copied from Gallery's `confirmed`/`scheduled`
// assumption — this repo's actual authoritative status enum (confirmed
// live via AppointmentForm.jsx's `statusOptions`) is `confirmed`,
// `pending`, `completed`, `cancelled`, `no-show`. `pending` is included as
// eligible because it is the one other status this app's own code already
// treats as an active/upcoming appointment (see
// PatientsView.jsx's own upcoming-appointment filter:
// `a.status === 'confirmed' || a.status === 'pending'`). `completed`,
// `cancelled`, and `no-show` are explicitly excluded (past/inactive/
// rejected outcomes).
//
// STRICT PRIVACY: this provider reads only `id`, `date`, `startTime`, and
// `status` off each appointment. `patientId`/`dentistId`/`roomId`/
// `treatmentId`/`notes`/`createdAt` are present on the same in-memory
// objects (App.jsx's existing `appointments` state includes them) but are
// never read, never copied into facts, and never logged here.

import { buildClinicDeviceLocalAppointmentStart } from '../utils/appointmentTime';
import type { InsightCandidate } from '../contracts/insightCandidate';

export const APPOINTMENT_SOON_WINDOW_MS = 2 * 60 * 60 * 1000;

const ELIGIBLE_STATUSES = new Set(['confirmed', 'pending']);

/** Minimal shape this provider actually reads — deliberately not the full
 *  mapped Appointment object (see datastore.supabase.appointments.js),
 *  which also carries patientId/dentistId/roomId/treatmentId/notes. */
export interface AppointmentLike {
  id: string;
  date: unknown;
  startTime: unknown;
  status: unknown;
}

export interface AppointmentSoonFacts {
  appointmentId: string;
  /** Clinic-device-local ISO instant — identical to the candidate's
   *  eventTime-equivalent use, kept as a plain field since this local
   *  contract has no separate eventTime field. */
  startAt: string;
  /** Normalized (trimmed, lowercased) status — the exact value eligibility
   *  was actually decided on. */
  status: string;
  minutesUntilStart: number;
}

function isEligibleStatus(status: unknown): status is string {
  if (typeof status !== 'string') return false;
  return ELIGIBLE_STATUSES.has(status.trim().toLowerCase());
}

interface QualifyingSource {
  appointmentId: string;
  start: Date;
  status: string;
  differenceMs: number;
}

function selectQualifyingSource(appt: AppointmentLike, evaluationNow: Date): QualifyingSource | null {
  if (!appt.id) return null;
  if (!isEligibleStatus(appt.status)) return null;

  const start = buildClinicDeviceLocalAppointmentStart(appt.date, appt.startTime);
  if (!start) return null;

  const differenceMs = start.getTime() - evaluationNow.getTime();
  if (differenceMs <= 0) return null; // already started or exactly now
  if (differenceMs > APPOINTMENT_SOON_WINDOW_MS) return null;

  return {
    appointmentId: appt.id,
    start,
    status: (appt.status as string).trim().toLowerCase(),
    differenceMs,
  };
}

/** Deterministic same-type tie-break: earliest local appointment start
 *  first, then appointment id. Never array/object iteration order. */
function compareForSelection(a: QualifyingSource, b: QualifyingSource): number {
  const aStart = a.start.getTime();
  const bStart = b.start.getTime();
  if (aStart !== bStart) return aStart - bStart;
  return a.appointmentId < b.appointmentId ? -1 : a.appointmentId > b.appointmentId ? 1 : 0;
}

function buildMessage(start: Date): string {
  try {
    const formattedTime = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(start);
    return formattedTime ? `You have an appointment at ${formattedTime}.` : 'You have an appointment starting soon.';
  } catch {
    return 'You have an appointment starting soon.';
  }
}

function collectQualifyingSources(appointments: AppointmentLike[], now: Date): QualifyingSource[] {
  const sources: QualifyingSource[] = [];
  for (const appt of appointments) {
    const source = selectQualifyingSource(appt, now);
    if (source) sources.push(source);
  }
  return sources;
}

function buildCandidateFromSource(winner: QualifyingSource): InsightCandidate<AppointmentSoonFacts> {
  const message = buildMessage(winner.start);
  const startAt = winner.start.toISOString();

  const facts: AppointmentSoonFacts = {
    appointmentId: winner.appointmentId,
    startAt,
    status: winner.status,
    minutesUntilStart: Math.round(winner.differenceMs / 60_000),
  };

  return {
    app: 'appointments',
    triggerId: 'appointment_soon',
    priority: 'HIGH',
    facts,
    messageTemplate: 'You have an appointment at {startTime}.',
    message,
    // "View Calendar" was a no-op — this insight only ever renders while
    // already on the calendar view. "View Today" reuses the exact existing
    // CalendarView.jsx "Today" button behavior (setCurrentDate(new Date()))
    // via App.jsx's onAction handler — see the contract's InsightAction doc.
    action: { label: 'View Today' },
    dedupeKey: `appointment_soon:${winner.appointmentId}:start:${startAt}`,
    sourceRecordId: winner.appointmentId,
    evaluatedAt: new Date().toISOString(),
  };
}

export function evaluateAppointmentSoon(
  appointments: AppointmentLike[],
  now: Date = new Date()
): InsightCandidate<AppointmentSoonFacts> | null {
  const sources = collectQualifyingSources(appointments, now);
  if (sources.length === 0) return null;

  const winner = [...sources].sort(compareForSelection)[0];
  return buildCandidateFromSource(winner);
}

/**
 * Additive: every independently eligible Appointment Soon record, in the
 * exact same business order compareForSelection already produces —
 * `evaluateAppointmentSoonCandidates(appointments, now)[0]` is always
 * identical to `evaluateAppointmentSoon(appointments, now)` (same `now`,
 * same eligibility window, same tie-break). Used only by the dialogue-layer
 * pool selector (see aiExperience/petDialogue/) so a Cat-dismissed soon
 * appointment can reveal the next still-eligible one instead of the whole
 * family silently disappearing — the inline PersonalizedInsight banner
 * keeps using evaluateAppointmentSoon above, unaffected.
 */
export function evaluateAppointmentSoonCandidates(
  appointments: AppointmentLike[],
  now: Date = new Date()
): InsightCandidate<AppointmentSoonFacts>[] {
  return [...collectQualifyingSources(appointments, now)].sort(compareForSelection).map(buildCandidateFromSource);
}
