-- Booking-confirmation email forwarding: an inbound-email provider (see
-- design/email-intake-setup.md) posts a forwarded email to the
-- parse-booking-email edge function, which extracts a proposed item
-- add/edit and drops it here for review — same "propose, never write"
-- shape as item_research_jobs, just triggered by an email instead of a
-- button tap. Not trip-scoped at insert time (the email's trip isn't known
-- yet, and may never resolve to exactly one), so ownership is the plain
-- user-owned-table pattern (mirrors keepers/companions), not
-- user_has_trip_access.
create table email_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),

  -- Raw inbound email, kept for the review screen to show "why did this
  -- happen" and for debugging a bad extraction — never itself shown as if
  -- it were trusted structured data.
  raw_from text,
  raw_subject text,
  raw_body text,

  -- Best-guess trip match (date-range overlap against the extracted
  -- dates) — null if none matched or more than one plausibly did; the
  -- review screen lets the user pick/correct it either way, so this is a
  -- convenience default, not a commitment.
  trip_id uuid references trips(id) on delete set null,

  -- If this looks like it updates an item that already exists (same trip,
  -- same type, overlapping dates, similar title/vendor/confirmation
  -- code), the best candidate is suggested here — again just a default the
  -- review screen can accept or override in favor of "create new instead".
  suggested_item_id uuid references items(id) on delete set null,
  match_reasoning text,

  -- The extraction itself. Every field arrives as {value, confidence,
  -- basis} — same reasoning as item_research_jobs.proposal: a blank field
  -- costs nothing, a confident wrong one costs a plan built on bad info.
  proposal jsonb,

  status text not null default 'pending'
    check (status in ('pending', 'applied', 'rejected', 'failed')),
  applied_item_id uuid references items(id) on delete set null,
  applied_action text check (applied_action in ('created', 'updated')),
  error text,
  cost_usd numeric,

  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index idx_email_proposals_user on email_proposals(user_id, created_at desc);
create index idx_email_proposals_pending on email_proposals(user_id) where status = 'pending';

alter table email_proposals enable row level security;
create policy email_proposals_owner on email_proposals
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- So the queue screen and Home's red-dot both update live, same reason
-- item_research_jobs is on this publication.
alter publication supabase_realtime add table email_proposals;
