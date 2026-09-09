-- Packing lists (per trip, seedable from app-level templates or another
-- trip) and a per-trip planned budget (NIS, matching the app's existing
-- NIS-normalized reporting — trips.default currency is always NIS per
-- trip_currencies.is_default).

alter table trips add column budget_amount numeric(12,2);

create table packing_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table packing_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references packing_templates(id) on delete cascade,
  name text not null,
  category text,
  sort_order int not null default 0
);

create index idx_packing_template_items_template on packing_template_items(template_id);

create table packing_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  name text not null,
  category text,
  packed boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index idx_packing_items_trip on packing_items(trip_id);

alter table packing_templates enable row level security;
alter table packing_template_items enable row level security;
alter table packing_items enable row level security;

-- Templates are app-level, owned directly by a user — no trip involved,
-- so this is a plain user_id check rather than user_has_trip_access.
create policy packing_templates_owner on packing_templates
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy packing_template_items_owner on packing_template_items
  for all using (
    exists (select 1 from packing_templates t where t.id = packing_template_items.template_id and t.user_id = auth.uid())
  )
  with check (
    exists (select 1 from packing_templates t where t.id = packing_template_items.template_id and t.user_id = auth.uid())
  );

create policy packing_items_owner on packing_items
  for all using (user_has_trip_access(trip_id))
  with check (user_has_trip_access(trip_id));
