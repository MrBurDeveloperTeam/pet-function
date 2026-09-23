-- OPTIONAL MANUAL QUERY — this file is not executed by the package.
-- Run it yourself in the shared Supabase project only if you want browser-side
-- SNAI/pet lifecycle events persisted instead of consuming the
-- `snabbb:diagnostic` CustomEvent or `window.__SNABBB_DIAGNOSTIC_SINK__`.
-- The schema intentionally has no prompt, answer, dialogue message, facts,
-- e-mail, token, profile data, or free-form metadata column.

create table if not exists public.snai_observability_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  event_id text not null unique check (char_length(event_id) between 8 and 200),
  event_type text not null check (event_type in (
    'snai_chat_submitted', 'snai_chat_answered', 'snai_chat_failed',
    'snai_fallback_used', 'snai_request_started', 'snai_request_succeeded',
    'snai_request_failed', 'pet_dialogue_evaluated', 'pet_dialogue_selected',
    'pet_dialogue_shown', 'pet_dialogue_closed', 'pet_dialogue_action_clicked'
  )),
  session_id text not null check (char_length(session_id) between 8 and 200),
  app_id text,
  request_id text,
  mode text,
  outcome text check (outcome is null or outcome in ('success', 'failure', 'fallback')),
  error_code text,
  retryable boolean,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  dialogue_id text,
  trigger_id text,
  rule_version text,
  reason_code text,
  candidate_count integer check (candidate_count is null or candidate_count >= 0),
  eligible_count integer check (eligible_count is null or eligible_count >= 0),
  action_type text,
  dialog_type text,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.snai_observability_events enable row level security;

drop policy if exists "snai events insert own" on public.snai_observability_events;
create policy "snai events insert own"
on public.snai_observability_events for insert
to authenticated
with check (actor_id = auth.uid());

drop policy if exists "snai events read own" on public.snai_observability_events;
create policy "snai events read own"
on public.snai_observability_events for select
to authenticated
using (actor_id = auth.uid());

create index if not exists snai_observability_events_actor_created_idx
  on public.snai_observability_events (actor_id, created_at desc);
create index if not exists snai_observability_events_request_idx
  on public.snai_observability_events (request_id)
  where request_id is not null;
