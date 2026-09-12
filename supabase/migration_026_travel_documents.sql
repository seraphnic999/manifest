-- Travel Documents (Doc Tracker): companions (people the user travels
-- with, including the user themself via is_self) and the ID/passport/visa
-- documents attached to each of them. Owned directly by auth.uid() — not
-- trip-scoped, matching packing_templates' convention (migration_019),
-- including its "plain user_id = auth.uid() check, no force-owner trigger"
-- shape since the app never sets user_id explicitly on insert.

create table companions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  is_self boolean not null default false,
  first_name text not null,
  last_name text not null default '',
  birth_date date,
  -- null only for the self row — a relationship to yourself doesn't apply
  relationship text check (relationship in (
    'mother','father','brother','sister','wife','husband','son','daughter','friend','other'
  )),
  profile_photo_path text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Exactly one "Me" row per user.
create unique index companions_one_self_per_user on companions(user_id) where is_self;
create index idx_companions_user on companions(user_id);

alter table companions enable row level security;
create policy companions_owner on companions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger trg_companions_updated_at before update on companions
  for each row execute function set_updated_at();

create table companion_photos (
  id uuid primary key default gen_random_uuid(),
  companion_id uuid not null references companions(id) on delete cascade,
  storage_path text not null,
  caption text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index idx_companion_photos_companion on companion_photos(companion_id);
alter table companion_photos enable row level security;
create policy companion_photos_owner on companion_photos
  for all using (
    exists (select 1 from companions where companions.id = companion_photos.companion_id and companions.user_id = auth.uid())
  )
  with check (
    exists (select 1 from companions where companions.id = companion_photos.companion_id and companions.user_id = auth.uid())
  );

create table travel_documents (
  id uuid primary key default gen_random_uuid(),
  companion_id uuid not null references companions(id) on delete cascade,
  type text not null check (type in ('passport','national_id','visa','drivers_license','other')),
  document_number text,
  issuing_country text,
  issue_date date,
  expiry_date date,
  notes text,
  photo_path text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_travel_documents_companion on travel_documents(companion_id);
alter table travel_documents enable row level security;
create policy travel_documents_owner on travel_documents
  for all using (
    exists (select 1 from companions where companions.id = travel_documents.companion_id and companions.user_id = auth.uid())
  )
  with check (
    exists (select 1 from companions where companions.id = travel_documents.companion_id and companions.user_id = auth.uid())
  );

create trigger trg_travel_documents_updated_at before update on travel_documents
  for each row execute function set_updated_at();

-- ---------- Storage: companion & document photo files ----------
-- Not trip-shared, so the RLS check is simpler than item-photos' — just
-- "first path segment is this user's own id". Paths:
--   companion-photos:   {userId}/{companionId}/{filename}
--   travel-documents:   {userId}/{documentId}/{filename}

insert into storage.buckets (id, name, public)
values ('companion-photos', 'companion-photos', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('travel-documents', 'travel-documents', false)
on conflict (id) do nothing;

create policy companion_photos_storage_owner on storage.objects
  for all using (bucket_id = 'companion-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'companion-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy travel_documents_storage_owner on storage.objects
  for all using (bucket_id = 'travel-documents' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'travel-documents' and (storage.foldername(name))[1] = auth.uid()::text);
