// Mandatory deterministic fallback — used ONLY when a deterministic
// provider succeeded (`status: 'ok'`) but the grounded Gemini phrasing
// request itself failed. Per the browser-validated Phase-3 pattern, a
// Gemini failure at this stage must NEVER fall through to legacy
// General Chat (which embeds raw patient PII) — this formatter renders
// the full answer directly from the same structured facts already
// deemed model-safe, with zero LLM involvement.

import type { AppointmentDataIntent } from '../contracts/groundedDataResult';
import type { AppointmentSoonDataFacts } from '../providers/appointmentSoonDataProvider';
import type { TodayCountDataFacts } from '../providers/todayCountDataProvider';
import type { RoomUsageDataFacts } from '../providers/roomUsageDataProvider';
import type { DailySummaryDataFacts } from '../providers/dailySummaryDataProvider';
import type { TodayScheduleDataFacts } from '../providers/todayScheduleDataProvider';
import type { NextAppointmentDataFacts, NextAppointmentItemFact } from '../providers/nextAppointmentDataProvider';

function pluralize(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

function truncationNote(count: number, shownCount: number): string {
  return count > shownCount ? ` Showing ${shownCount} of ${count}.` : '';
}

function formatTimeLocal(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatDateLocal(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatSoon(facts: AppointmentSoonDataFacts): string {
  if (facts.count === 0) return 'No appointments are coming up within the next 2 hours.';
  const lines = facts.appointments.map(
    (a, i) => `${i + 1}. ${formatTimeLocal(a.startAt)}${a.roomName ? ` — ${a.roomName}` : ''}`
  );
  return `You have ${pluralize(facts.count, 'appointment')} coming up within the next 2 hours.${truncationNote(
    facts.count,
    facts.shownCount
  )}\n${lines.join('\n')}`;
}

function formatTodayCount(facts: TodayCountDataFacts): string {
  if (facts.appointmentCountToday === 0) return 'You have no active appointments today.';
  return `You have ${pluralize(facts.appointmentCountToday, 'appointment')} today.`;
}

function formatRoomUsage(facts: RoomUsageDataFacts): string {
  if (facts.occupiedRoomCount === 0) return 'No rooms are currently in use.';
  const lines = facts.rooms.map((r, i) => `${i + 1}. ${r.roomName ?? 'Unnamed room'}`);
  return `${pluralize(facts.occupiedRoomCount, 'room')} currently in use.${truncationNote(
    facts.count,
    facts.shownCount
  )}\n${lines.join('\n')}`;
}

// This intent's facts ARE patient identity (see
// todayScheduleDataProvider.ts's own "NOT MODEL-SAFE FACTS" header) — this
// formatter is the ONLY renderer for `appointment_today_list`, called
// directly by appointmentsMolarAdapter.ts, never via
// chatWithGroundedAppointmentFacts/Gemini.
function formatTodaySchedule(facts: TodayScheduleDataFacts): string {
  if (facts.count === 0) return "You don't have any appointments scheduled for today.";
  const lines = facts.appointments.map((a) => {
    const who = a.patientName ?? 'Unnamed patient';
    const header = `${formatTimeLocal(a.startAt)} — ${who}`;
    const details = [a.treatmentName, a.dentistName, a.roomName].filter((v): v is string => !!v).join(' · ');
    return details ? `${header}\n${details}` : header;
  });
  return `You have ${pluralize(facts.count, 'appointment')} today.${truncationNote(facts.count, facts.shownCount)}\n\n${lines.join('\n\n')}`;
}

// Same deliberate exception as `formatTodaySchedule` above (see
// nextAppointmentDataProvider.ts's own "NOT MODEL-SAFE FACTS" header) —
// this formatter is the ONLY renderer for `appointment_next_appointment`,
// called directly by appointmentsMolarAdapter.ts, never via
// chatWithGroundedAppointmentFacts/Gemini.
function nextAppointmentDetails(a: NextAppointmentItemFact): string {
  return [a.treatmentName, a.dentistName, a.roomName].filter((v): v is string => !!v).join(' · ');
}

function formatNextAppointment(facts: NextAppointmentDataFacts): string {
  if (facts.appointments.length === 0) {
    return facts.todayOnly
      ? "You don't have any more appointments scheduled for today."
      : "You don't have any upcoming appointments.";
  }

  const first = facts.appointments[0];
  const when = facts.isToday
    ? `${formatTimeLocal(first.startAt)} today`
    : `${formatDateLocal(first.startAt)} at ${formatTimeLocal(first.startAt)}`;

  if (facts.appointments.length === 1) {
    const who = first.patientName ?? 'Unnamed patient';
    const header = `Your next patient is ${who} at ${when}.`;
    const details = nextAppointmentDetails(first);
    return details ? `${header}\n\n${details}` : header;
  }

  // Genuine tie for the earliest upcoming start time — format honestly
  // instead of arbitrarily picking one (see nextAppointmentDataProvider.ts's
  // own tie-handling header).
  const lines = facts.appointments.map((a) => {
    const who = a.patientName ?? 'Unnamed patient';
    const details = nextAppointmentDetails(a);
    return details ? `${who}\n${details}` : who;
  });
  return `You have ${facts.appointments.length} appointments starting at ${when}.\n\n${lines.join('\n\n')}`;
}

function formatDailySummary(facts: DailySummaryDataFacts): string {
  const parts = [
    `${pluralize(facts.appointmentCountToday, 'appointment')} today`,
    `${facts.upcomingWithinTwoHoursCount} coming up within 2 hours`,
    `${pluralize(facts.occupiedRoomCount, 'room')} in use`,
  ];
  let text = `Daily summary: ${parts.join(', ')}.`;
  if (facts.nextAppointmentMinutes !== undefined) {
    text += ` Next appointment in ${pluralize(facts.nextAppointmentMinutes, 'minute')}.`;
  }
  return text;
}

export function formatGroundedAppointmentFallback(intent: AppointmentDataIntent, facts: unknown): string {
  switch (intent) {
    case 'appointment_soon':
      return formatSoon(facts as AppointmentSoonDataFacts);
    case 'appointment_today_count':
      return formatTodayCount(facts as TodayCountDataFacts);
    case 'appointment_room_usage':
      return formatRoomUsage(facts as RoomUsageDataFacts);
    case 'appointment_daily_summary':
      return formatDailySummary(facts as DailySummaryDataFacts);
    case 'appointment_today_list':
      return formatTodaySchedule(facts as TodayScheduleDataFacts);
    case 'appointment_next_appointment':
      return formatNextAppointment(facts as NextAppointmentDataFacts);
    default:
      return "I couldn't format your appointment answer right now.";
  }
}
