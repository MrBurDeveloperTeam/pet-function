// Appointments Phase-3 Data-Driven Chat contract — deliberately separate
// from ../../contracts/insightCandidate.ts (Phase-2's proactive-banner
// contract). Direct-QA semantics differ: a grounded answer is chosen by
// the user's own question, not a resolver picking one winning proactive
// candidate, and this contract has no `priority`/`dedupeKey`/`action`.

export type AppointmentDataIntent =
  | 'appointment_soon'
  | 'appointment_today_count'
  | 'appointment_room_usage'
  | 'appointment_daily_summary'
  | 'appointment_today_list'
  | 'appointment_next_appointment';

export type GroundedDataResult<TFacts> =
  | {
      status: 'ok';
      intent: AppointmentDataIntent;
      /** Model-safe structured facts only — see each provider's own file
       *  header for exactly which fields are safe to send to Gemini.
       *  Never a raw appointment row, never patient data. */
      facts: TFacts;
      evaluatedAt: string;
      /** Local-only appointment ids (never sent to Gemini) — used for
       *  traceability/stable ordering. Empty for aggregate-only intents
       *  with no single backing record (today_count, daily_summary). */
      sourceRecordIds: string[];
    }
  | {
      status: 'unavailable';
      intent: AppointmentDataIntent;
      reasonCode: 'loading' | 'data_error' | 'coverage_unavailable' | 'evaluation_error';
      evaluatedAt: string;
    };

/** `ready` requires the EXISTING appointment fetch (see
 *  src/hooks/useDataStore.js) to have actually succeeded — a naive
 *  `[]`-initialized array cannot distinguish "still loading" from "query
 *  failed" from "successfully empty". Reset to `loading` on clinic
 *  change so a stale previous clinic's readiness can never authorize an
 *  answer. */
export type AppointmentDataStatus = 'loading' | 'ready' | 'error';
