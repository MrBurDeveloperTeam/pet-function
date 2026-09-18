// Grounded conversational follow-up resolver — Tier C of the 5-tier
// routing model. Tried ONLY when classifyAppointmentDataIntent(msg)
// returned `no_match` AND an active GroundedConversationContext exists
// from `appointment_today_list`/`appointment_next_appointment`.
//
// PRIVACY: identical to those two intents' own rule — every answer here
// is built LOCALLY from `resolveAppointmentDataQuery`'s facts and
// rendered with plain string formatting only. NO Gemini call is ever
// made for a follow-up in this file, matching the zero-patient-PII-to-
// Gemini boundary those two source intents already enforce for their
// own first answer (see groundedConversationContext.ts's header).
//
// REVALIDATION: every follow-up re-resolves the SAME `lastIntent`
// (and, for next-appointment, the same `todayOnly` scope) against the
// CURRENT live `appointments` array — never a cached snapshot.

import { resolveAppointmentDataQuery } from '../resolver/resolveAppointmentDataQuery';
import type { GroundedConversationContext } from '../context/groundedConversationContext';
import type { AppointmentDataStatus } from '../contracts/groundedDataResult';
import type { DateRangeLike } from '../../utils/appointmentCoverage';

interface AppointmentItemFact {
  startAt: string;
  status: string;
  patientName?: string;
  treatmentName?: string;
  dentistName?: string;
  roomName?: string;
}

interface AppointmentListFacts {
  count: number;
  appointments: AppointmentItemFact[];
}

function normalize(message: string): string {
  return message
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mentionsAny(msg: string, phrases: string[]): boolean {
  return phrases.some((p) => msg.includes(p));
}

function formatTimeLocal(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function describeAppointment(a: AppointmentItemFact): string {
  const who = a.patientName ?? 'Unnamed patient';
  const header = `${formatTimeLocal(a.startAt)} — ${who}`;
  const details = [a.treatmentName, a.dentistName, a.roomName].filter((v): v is string => !!v).join(' · ');
  return details ? `${header}\n${details}` : header;
}

const WHO_PHRASES = ['who is that', 'who is it', 'who is the patient', 'who is next'];
const TIME_PHRASES = ['what time', 'when is that', 'when is it'];
const ROOM_PHRASES = ['which room', 'what room'];
const DENTIST_PHRASES = [
  'which dentist',
  'what dentist',
  'who is the dentist',
  'which doctor',
  'what doctor',
  'who is the doctor',
  'who is handling',
  'which dentist is handling',
];
const AFTER_PHRASES = ['what comes after', 'whats after that', 'who is after', 'after that'];
const REMAINING_COUNT_PHRASES = [
  'how many are left',
  'how many remaining',
  'how many left',
  'how many more',
  'how many are there',
  'how many appointments are there',
  'how many appointments',
];
// A context-dependent question that clearly refers to the previous
// grounded result but names a field Appointment doesn't track (there is
// no urgency/priority field on an appointment) — this must return a
// deterministic clarification, never silently fall through to generic
// General Chat, and never invent an urgency ranking that doesn't exist.
const URGENCY_PHRASES = [
  'most urgent',
  'which one is most urgent',
  'which is most urgent',
  'which one is the most urgent',
  'most important',
  'highest priority',
  'top priority',
];
// "Which one is next?" / "which one is earliest?" have no literal
// ORDINAL_WORDS match but unambiguously mean "the first (soonest) one in
// the already-sorted list" for a grounded appointment list.
const NEXT_OR_EARLIEST_PHRASES = [
  'which one is next',
  'which is next',
  'whats next',
  "what's next",
  'which one is earliest',
  'which is earliest',
  'the earliest one',
  'the earliest',
];

const ORDINAL_WORDS: Array<[string, number]> = [
  ['first', 0],
  ['second', 1],
  ['third', 2],
  ['fourth', 3],
  ['fifth', 4],
  ['last', -1],
];

function detectOrdinalIndex(msg: string, listLength: number): number | null {
  for (const [word, idx] of ORDINAL_WORDS) {
    if (msg.includes(word)) {
      if (idx === -1) return listLength > 0 ? listLength - 1 : null;
      return idx;
    }
  }
  return null;
}

export function resolveAppointmentFollowUp(
  message: string,
  context: GroundedConversationContext | null,
  appointments: unknown[],
  rooms: unknown[],
  appointmentDataStatus: AppointmentDataStatus,
  loadedAppointmentRange: DateRangeLike | null | undefined,
  patients: unknown[],
  staff: unknown[],
  treatments: unknown[]
): string | null {
  if (!context) return null;

  const msg = normalize(message);
  if (!msg) return null;

  const result = resolveAppointmentDataQuery(
    context.lastIntent,
    appointments,
    rooms,
    appointmentDataStatus,
    loadedAppointmentRange,
    patients,
    staff,
    treatments,
    context.todayOnly
  );
  if (result.status !== 'ok') return null;

  const facts = result.facts as AppointmentListFacts;
  if (facts.appointments.length === 0) return null;

  const list = facts.appointments;

  // Checked first, before any other phrase table: Appointment has no
  // urgency/priority field, so "most urgent" must never be silently
  // reinterpreted as an ordinal/time/room lookup below, and must never
  // fall through to generic General Chat — it stays a grounded,
  // deterministic clarification.
  if (mentionsAny(msg, URGENCY_PHRASES)) {
    return "I don't have an urgency field for appointments. Do you mean which appointment is next?";
  }

  if (mentionsAny(msg, REMAINING_COUNT_PHRASES)) {
    return `${facts.count} appointment${facts.count === 1 ? '' : 's'} remaining.`;
  }

  if (mentionsAny(msg, AFTER_PHRASES)) {
    const second = list[1];
    if (!second) return "There's nothing scheduled after that right now.";
    return describeAppointment(second);
  }

  // "who is next"/single-appointment context: default to the first
  // (soonest) entry unless an explicit ordinal says otherwise. "which one
  // is next"/"which one is earliest" carry no literal ORDINAL_WORDS match
  // but unambiguously mean the same soonest (index 0) entry.
  let idx = detectOrdinalIndex(msg, list.length);
  if (idx === null && mentionsAny(msg, NEXT_OR_EARLIEST_PHRASES)) {
    idx = 0;
  }
  const target = idx !== null ? list[idx] : list[0];

  if (idx !== null && (idx < 0 || idx >= list.length)) {
    return `I only have ${list.length} appointment${list.length === 1 ? '' : 's'} in view right now.`;
  }
  if (!target) return null;

  if (mentionsAny(msg, WHO_PHRASES)) {
    return `That's ${target.patientName ?? 'an unnamed patient'}.`;
  }
  if (mentionsAny(msg, TIME_PHRASES)) {
    return `${formatTimeLocal(target.startAt)}.`;
  }
  if (mentionsAny(msg, ROOM_PHRASES)) {
    return target.roomName ? `${target.roomName}.` : "That appointment doesn't have a room assigned.";
  }
  if (mentionsAny(msg, DENTIST_PHRASES)) {
    // Local, deterministic formatting only — dentistName is already part
    // of the same NOT-MODEL-SAFE facts this whole file only ever renders
    // with plain string formatting (see this file's header); never sent
    // to Gemini or the semantic LLM router.
    return target.dentistName ? `${target.dentistName}.` : "That appointment doesn't have a dentist assigned.";
  }
  if (idx !== null) {
    return describeAppointment(target);
  }

  return null;
}
