import { getSuperappHostDependencies } from '../../dependencies';
import type { CandidateProviderFailureReason, CandidateProviderResult, DialogueCandidate } from '../types';
import { addCalendarDaysToDateKey, toCalendarDateKey } from '../dateUtils';
import { evaluateAppointmentSoon } from './appointmentSoonProvider';

/**
 * Fetches the current authenticated user's clinic-visible `public.appointments`
 * rows for a narrow [today, tomorrow] local date window. Deliberately does
 * NOT filter by clinic id client-side: production RLS on `appointments`
 * (`appointments_member_all`, `clinic_id = current_clinic_id() OR
 * is_admin()`, live-verified) already enforces clinic scoping server-side —
 * this mirrors the same already-reviewed pattern used by the Inventory and
 * Todo snapshot providers, where RLS (not a client-side filter) is the
 * authorization boundary. `userId` is still required to gate the call (no
 * matched identity → no query) and for the caller's own de-duplication
 * scoping.
 */

export interface AppointmentSnapshotRow {
  id: string;
  date: string | null;
  start_time: string | null;
  status: string | null;
  created_at: string | null;
}

export interface AppointmentSnapshot {
  appointments: AppointmentSnapshotRow[];
}

export interface AppointmentDialogueEvaluation {
  appointmentSoonCandidate: DialogueCandidate | null;
  /** Ordered candidate pool, additive alongside the single-winner field
   *  above — `appointmentSoonCandidates[0] === appointmentSoonCandidate`.
   *  See appointmentSoonProvider.ts for the ordering it preserves. */
  appointmentSoonCandidates: DialogueCandidate[];
}

const APPOINTMENT_PAGE_SIZE = 200;
// Safety net against a runaway/non-advancing pagination loop, not a
// correctness truncation — hitting it fails the evaluation rather than
// silently returning a partial appointment set. 50 pages * 200 rows =
// 10,000 appointments in a 2-day window, far beyond any real clinic's
// volume today.
const MAX_APPOINTMENT_PAGES = 50;
const PROVIDER_TIMEOUT_MS = 10_000;

/** Thrown internally to carry a specific, typed failure reason up to the
 *  single catch site in fetchAppointmentSnapshot. Never allowed to escape
 *  this module. */
class ProviderFailure extends Error {
  readonly reason: CandidateProviderFailureReason;
  constructor(reason: CandidateProviderFailureReason) {
    super(`[petDialogue] appointment snapshot failure: ${reason}`);
    this.reason = reason;
  }
}

function isAbortLikeError(err: unknown): boolean {
  return (err as { name?: string })?.name === 'AbortError';
}

/**
 * Fetches every eligible-status appointment in [localToday, localTomorrow]
 * visible to the current session via deterministic keyset pagination
 * (ordered by `id` ascending, no arbitrary total-row cap). The
 * `status IN ('confirmed','scheduled')` filter here is a practical
 * server-side narrowing only, not the authoritative eligibility check —
 * evaluateAppointmentSoon re-normalizes status independently, since the
 * column is free text and could contain malformed casing/whitespace this
 * exact-match filter would miss. Any of the following is treated as a
 * failure (never a silently-truncated success): a page query error, a
 * cursor that fails to advance, a missing row id, a duplicate id across
 * pages, or exceeding MAX_APPOINTMENT_PAGES.
 */
async function fetchAllVisibleAppointments(
  localToday: string,
  localTomorrow: string,
  signal: AbortSignal
): Promise<AppointmentSnapshotRow[]> {
  const { supabase } = getSuperappHostDependencies();
  const rows: AppointmentSnapshotRow[] = [];
  const seenIds = new Set<string>();
  let cursor: string | null = null;
  let pageCount = 0;

  for (;;) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    if (pageCount >= MAX_APPOINTMENT_PAGES) {
      throw new ProviderFailure('pagination_incomplete');
    }
    pageCount += 1;

    let query = supabase
      .from('appointments')
      .select('id, date, start_time, status, created_at')
      .gte('date', localToday)
      .lte('date', localTomorrow)
      .in('status', ['confirmed', 'scheduled'])
      .order('id', { ascending: true })
      .limit(APPOINTMENT_PAGE_SIZE);

    if (cursor !== null) {
      query = query.gt('id', cursor);
    }

    const { data, error } = await query.abortSignal(signal);
    if (error) throw new ProviderFailure('item_query_failed');

    const page = (data || []) as AppointmentSnapshotRow[];
    if (page.length === 0) break;

    const lastId = page[page.length - 1]?.id;
    if (!lastId) throw new ProviderFailure('unexpected_data');

    // `.gt('id', cursor)` should guarantee this server-side; re-checked here
    // as a defensive invariant rather than trusted blindly.
    if (cursor !== null && !(lastId > cursor)) {
      throw new ProviderFailure('pagination_incomplete');
    }

    for (const row of page) {
      if (!row.id) throw new ProviderFailure('unexpected_data');
      if (seenIds.has(row.id)) {
        // A duplicate id across pages means pagination can't be trusted;
        // fail closed rather than risk under- or double-counting.
        throw new ProviderFailure('unexpected_data');
      }
      seenIds.add(row.id);
      rows.push(row);
    }

    cursor = lastId;

    if (page.length < APPOINTMENT_PAGE_SIZE) break; // final partial page — done
  }

  return rows;
}

async function fetchAppointmentSnapshot(
  userId: string,
  localToday: string,
  localTomorrow: string,
  signal?: AbortSignal
): Promise<CandidateProviderResult<AppointmentSnapshot>> {
  if (!userId) return { status: 'success', candidate: { appointments: [] } };

  // Same timeout/abort disambiguation as inventorySnapshotProvider.ts /
  // todoSnapshotProvider.ts: an external abort (unmount/logout/newer-
  // generation) must resolve as `aborted` (apply no result), while a
  // request that's simply taking too long must resolve as `failed` with
  // reason 'timeout' (show the neutral fallback).
  const internalController = new AbortController();
  let timedOut = false;

  const onExternalAbort = () => internalController.abort();
  if (signal) {
    if (signal.aborted) internalController.abort();
    else signal.addEventListener('abort', onExternalAbort);
  }

  const timeoutId = setTimeout(() => {
    timedOut = true;
    internalController.abort();
  }, PROVIDER_TIMEOUT_MS);

  try {
    const appointments = await fetchAllVisibleAppointments(localToday, localTomorrow, internalController.signal);
    return { status: 'success', candidate: { appointments } };
  } catch (err) {
    if (isAbortLikeError(err)) {
      if (signal?.aborted) return { status: 'aborted' };
      if (timedOut) return { status: 'failed', reason: 'timeout' };
      return { status: 'aborted' };
    }
    if (err instanceof ProviderFailure) {
      return { status: 'failed', reason: err.reason };
    }
    console.warn('[petDialogue] appointment snapshot fetch failed unexpectedly');
    return { status: 'failed', reason: 'unexpected_data' };
  } finally {
    clearTimeout(timeoutId);
    if (signal) signal.removeEventListener('abort', onExternalAbort);
  }
}

/**
 * Single hook-facing entry point: captures one local clock snapshot
 * (`evaluationNow`), derives the [localToday, localTomorrow] query window
 * from it, fetches the appointment snapshot once, then derives the P1
 * Appointment Within 2 Hours candidate from it — using that same captured
 * `evaluationNow`, never a freshly-read clock, so a single evaluation is
 * always internally consistent even if it happens to straddle local
 * midnight while in flight.
 */
export async function fetchAppointmentDialogueEvaluation(
  userId: string,
  evaluationNow: Date,
  signal?: AbortSignal
): Promise<CandidateProviderResult<AppointmentDialogueEvaluation>> {
  const localToday = toCalendarDateKey(evaluationNow);
  const localTomorrow = addCalendarDaysToDateKey(localToday, 1);

  const snapshotResult = await fetchAppointmentSnapshot(userId, localToday, localTomorrow, signal);
  if (snapshotResult.status !== 'success') return snapshotResult;

  const snapshot = snapshotResult.candidate ?? { appointments: [] };
  const { candidate: appointmentSoonCandidate, candidates: appointmentSoonCandidates } = evaluateAppointmentSoon(
    snapshot,
    evaluationNow
  );

  return { status: 'success', candidate: { appointmentSoonCandidate, appointmentSoonCandidates } };
}
