-- Item research: an agent looks up missing details (address, phone, website,
-- a proper Google Maps link, opening hours, reservation lead time) for a
-- single trip item and proposes them for review — it never writes to
-- `items` directly. A job holds the proposal; an item only changes when a
-- human accepts it in the app. Mirrors the trip-scoped RLS pattern every
-- other item-child table uses (item_photos, expenses, ...), not a new shape.

create table item_research_jobs (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references items(id) on delete cascade,
  trip_id uuid not null references trips(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'researching', 'ready', 'accepted', 'rejected', 'failed')),

  -- The confirmed identification from the quick foreground "identify" step —
  -- what the background research anchors on, so it doesn't have to re-derive
  -- which real-world place this is from scratch.
  identified_name text,
  identified_context jsonb,

  -- The agent's proposal. Every field arrives as
  --   { value, confidence, basis, source }
  -- rather than a bare value, so the review screen can show where each
  -- answer came from and a guess never renders as a fact.
  proposal jsonb,

  -- What the user actually applied, after their edits. Kept alongside the
  -- proposal even after review — a rejected/edited proposal is evidence of
  -- what the agent gets wrong, worth keeping rather than discarding.
  accepted jsonb,

  error text,
  cost_usd numeric,
  usage jsonb,

  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  reviewed_at timestamptz
);

create index idx_item_research_jobs_trip on item_research_jobs(trip_id, created_at desc);
create index idx_item_research_jobs_item on item_research_jobs(item_id, created_at desc);
-- Partial: the pending-review badge on an item only ever asks "is there a
-- ready job for this item", and the queue screen only ever asks "what's
-- still in flight" — both narrow scans, not full-table ones.
create index idx_item_research_jobs_ready on item_research_jobs(item_id) where status = 'ready';
create index idx_item_research_jobs_pending on item_research_jobs(status) where status in ('queued', 'researching');

alter table item_research_jobs enable row level security;
create policy item_research_jobs_owner on item_research_jobs
  for all using (user_has_trip_access(trip_id))
  with check (user_has_trip_access(trip_id));

-- The queue screen and the item's own pending-badge both subscribe to their
-- relevant rows so a job that finishes while the app is open moves to
-- "ready" without a manual refresh — the same reason days/companions rows
-- don't need one either, just applied to a background job for once.
alter publication supabase_realtime add table item_research_jobs;
