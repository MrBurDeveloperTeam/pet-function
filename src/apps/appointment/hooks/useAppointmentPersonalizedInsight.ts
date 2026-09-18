// Minimal hook wiring the local resolver into React — mirrors the
// browser-validated To-Do/Inventory pattern (useTodoPersonalizedInsight.ts,
// useInventoryPersonalizedInsight.ts), with additions specific to this
// trigger.
//
// 1. RUNTIME PII PROJECTION: `appointments`/`rooms` here are App.jsx's
// existing FULL state — the same objects carrying
// patientId/dentistId/roomId/treatmentId/notes/createdAt (see
// datastore.supabase.appointments.js's mapAppointment). The parameter
// types below are deliberately `unknown[]`, not the providers' narrower
// types — declaring them narrower would only change what TypeScript
// *lets you read*, not what the object *contains* at runtime, so it
// would not actually keep patient data out of anything holding a
// reference to these objects. This hook calls TWO separate least-
// privilege projections before anything reaches the resolver:
//   - `projectAppointmentsForInsight` (../utils/appointmentProjection.ts)
//     — id/date/startTime/status only — feeds ONLY Appointment Soon.
//   - `projectAppointmentsForDailySummary` /
//     `projectRoomsForDailySummary` (../utils/appointmentDailyProjection.ts)
//     — adds endTime/roomId (appointments) and id/name (rooms) — feeds
//     ONLY Daily Summary / No Appointments Today.
// Appointment Soon's input is never widened just because the other two
// candidates need extra operational fields — see those files' headers.
//
// 2. MINUTE-BOUNDARY-ALIGNED CLOCK: Appointment Within 2 Hours AND Room In
// Use (a fact inside Daily Summary) are both clock-time rules whose
// eligibility can change purely from time passing, with no `appointments`
// state change at all — a static `useMemo([appointments])` alone would
// never re-derive either as the clock ticks past a window/start/end. No
// existing minute-level clock/tick mechanism was found anywhere in this
// app (App.jsx's `currentDate` is the CALENDAR navigation date, not a live
// "now" ticker). A plain `setInterval(fn, 60_000)` started at an arbitrary
// second would lag entry into (or exit from) these windows by up to ~59s,
// since appointment times are minute-resolution `HH:mm` data. This hook:
// (a) computes the exact ms remaining until the next real minute
// boundary, (b) `setTimeout`s to that boundary, ticks once there, (c) THEN
// starts a 60s `setInterval` so every subsequent tick also lands on a
// minute boundary, and (d) cleans up both the timeout and the interval on
// unmount/re-run. This ONE clock drives every time-sensitive candidate in
// this feature — Daily Summary's room-occupancy fact does NOT get its own
// second timer, it simply re-derives inside the same `useMemo` below.
// Never polls Supabase, never ticks more than once a minute.
//
// Deliberately NOT sessionStorage-deduped, NOT cooldown-gated: this is a
// persistent landing/calendar banner, not an interruption — it should
// always reflect current appointment state (and current time) whenever
// rendered. If the appointment is cancelled/rescheduled outside the
// window, or its start passes, the candidate naturally disappears on the
// next re-render (immediate for an `appointments` change, within one
// minute boundary for pure clock passage).
//
// Loading is handled upstream: App.jsx already returns an entirely
// different "Loading your clinic…" screen while `isReady` is false (see
// App.jsx around its `isReady` check), so the component tree that mounts
// this hook is only ever rendered once appointment data has already
// loaded — no separate loading gate is needed here.

import { useEffect, useMemo, useState } from 'react';
import { buildAppointmentDialoguePool } from '../petDialogue/buildAppointmentDialoguePool';
import { projectAppointmentsForInsight } from '../utils/appointmentProjection';
import { projectAppointmentsForDailySummary, projectRoomsForDailySummary } from '../utils/appointmentDailyProjection';
import type { DateRangeLike } from '../utils/appointmentCoverage';
import type { InsightCandidate } from '../contracts/insightCandidate';

export interface AppointmentPersonalizedInsightResult {
  /** Ordered dialogue pool across Appointment Soon > Daily Summary > None
   *  Today (see buildAppointmentDialoguePool.ts). Feeds ONLY Cat's
   *  dismissal-aware selection — the inline PersonalizedInsight banner
   *  this hook used to also feed (via a separate `candidate` field) was
   *  removed; see SNABBB-CROSS-APP-REMOVE-REMINDER-BANNERS. */
  candidates: InsightCandidate<unknown>[];
}

export function useAppointmentPersonalizedInsight(
  appointments: unknown[],
  rooms: unknown[],
  dateRange: DateRangeLike | null | undefined
): AppointmentPersonalizedInsightResult {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // Bare global setTimeout/setInterval (not `window.`-prefixed) so the id
    // types stay consistent with whichever lib (DOM vs Node) this project's
    // tsconfig resolves them to — mixing `window.setInterval`'s return type
    // with a `Timeout`-typed variable is a common source of a spurious
    // type mismatch when both @types/node and DOM lib are present.
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const now = new Date();
    const msIntoCurrentMinute = now.getSeconds() * 1000 + now.getMilliseconds();
    const msUntilNextMinuteBoundary = 60_000 - msIntoCurrentMinute;

    const timeoutId = setTimeout(() => {
      setTick((t) => t + 1);
      intervalId = setInterval(() => setTick((t) => t + 1), 60_000);
    }, msUntilNextMinuteBoundary);

    return () => {
      clearTimeout(timeoutId);
      if (intervalId !== null) clearInterval(intervalId);
    };
  }, []);

  return useMemo(() => {
    try {
      // Runtime projections happen here, before the resolver/provider ever
      // see anything — see the file header for why a narrower TS type
      // alone would not have been sufficient. Two SEPARATE least-privilege
      // projections, not one shared/widened one — see appointmentDailyProjection.ts.
      const soonInput = projectAppointmentsForInsight(appointments);
      const dailyInput = projectAppointmentsForDailySummary(appointments);
      const roomsInput = projectRoomsForDailySummary(rooms);
      // ONE captured instant, threaded into BOTH the inline resolver and
      // the Cat-only dialogue pool builder for this exact evaluation cycle
      // — never two independent `new Date()` calls that could disagree
      // about which side of a 2-hour-window/minute boundary "now" falls
      // on. See resolveAppointmentInsight.ts's `now` param doc and
      // buildAppointmentDialoguePool.ts's header for the full rationale.
      const now = new Date();
      const candidates = buildAppointmentDialoguePool(soonInput, dailyInput, roomsInput, dateRange, now);
      return { candidates };
    } catch (err) {
      // A provider failure must never produce a fabricated personalized
      // claim or a raw error surfaced to the user — in particular it must
      // never be mistaken for "No Appointments Today". Evaluation here is
      // pure (no network call) — this is only a last-resort guard against
      // a malformed appointment/room row; the safe behavior is simply "no
      // insight this render". Never logs the appointments/rooms arrays.
      console.warn('[aiExperience] appointment personalized insight evaluation failed:', err);
      return { candidates: [] };
    }
    // `tick` is intentionally a dependency purely to force re-evaluation as
    // the clock passes — its value is never read inside the callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointments, rooms, dateRange, tick]);
}
