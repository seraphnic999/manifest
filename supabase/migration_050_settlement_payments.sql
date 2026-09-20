-- ============================================================
-- Manifest — Migration 050: settlement payments
-- ============================================================
-- Closes a real gap in the existing expense-split model: allocations
-- record what a companion OWES (see expenses/allocations, migration
-- baseline), but nothing has ever recorded a debt actually being paid
-- back. Each row here is one payment received from one party toward
-- their running total — amount only in NIS (the settlement screen and
-- the existing Report screen's "Owed to me" section are already
-- NIS-normalized; a companion pays back in whatever's convenient, not
-- tracked per-currency the way an original expense is).
-- ============================================================

create table settlement_payments (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  party_id uuid not null references trip_parties(id) on delete cascade,
  amount_nis numeric(12,2) not null,
  payment_date date,
  note text,
  created_at timestamptz not null default now(),
  constraint settlement_payment_amount_positive check (amount_nis > 0)
);

alter table settlement_payments enable row level security;

create policy settlement_payments_owner on settlement_payments
  for all using (user_has_trip_access(trip_id))
  with check (user_has_trip_access(trip_id));
