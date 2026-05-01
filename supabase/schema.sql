-- Splitly schema — single-tenant model:
-- Each authenticated user has their own private people, groups, expenses, events, notifications.
-- Run this in Supabase Dashboard → SQL Editor → New query → paste → Run.

-- ============ Tables ============

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  color text not null default '#10b981',
  created_at timestamptz not null default now()
);

create table people (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#10b981',
  is_self boolean not null default false,
  created_at timestamptz not null default now()
);

create table groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  emoji text default '👥',
  created_at timestamptz not null default now()
);

create table group_members (
  group_id uuid not null references groups(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  primary key (group_id, person_id)
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  group_id uuid not null references groups(id) on delete cascade,
  description text not null,
  amount numeric(12, 2) not null check (amount > 0),
  paid_by uuid not null references people(id) on delete cascade,
  type text not null default 'expense' check (type in ('expense', 'settlement')),
  date timestamptz not null default now()
);

create table expense_splits (
  expense_id uuid not null references expenses(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  primary key (expense_id, person_id)
);

create table events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  actor_id uuid references auth.users(id) on delete set null,
  label text not null,
  payload jsonb default '{}',
  ts timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  to_person_id uuid not null references people(id) on delete cascade,
  message text not null,
  read boolean not null default false,
  group_id uuid references groups(id) on delete cascade,
  ts timestamptz not null default now()
);

-- Indexes for common reads
create index people_owner_idx on people(owner_id);
create index groups_owner_idx on groups(owner_id);
create index expenses_owner_group_idx on expenses(owner_id, group_id);
create index expense_splits_expense_idx on expense_splits(expense_id);
create index group_members_group_idx on group_members(group_id);
create index events_owner_ts_idx on events(owner_id, ts desc);
create index notifications_owner_ts_idx on notifications(owner_id, ts desc);

-- ============ Row-Level Security ============

alter table profiles        enable row level security;
alter table people          enable row level security;
alter table groups          enable row level security;
alter table group_members   enable row level security;
alter table expenses        enable row level security;
alter table expense_splits  enable row level security;
alter table events          enable row level security;
alter table notifications   enable row level security;

-- Profiles: each user reads/writes only their own
create policy "own profile" on profiles for all
  using (id = auth.uid())
  with check (id = auth.uid());

-- People / groups / expenses / events / notifications: owner-scoped
create policy "own people"        on people        for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own groups"        on groups        for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own expenses"      on expenses      for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own events"        on events        for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "own notifications" on notifications for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Join tables: ownership inherited via parent
create policy "own group_members" on group_members for all
  using (exists (select 1 from groups g where g.id = group_id and g.owner_id = auth.uid()))
  with check (exists (select 1 from groups g where g.id = group_id and g.owner_id = auth.uid()));

create policy "own expense_splits" on expense_splits for all
  using (exists (select 1 from expenses e where e.id = expense_id and e.owner_id = auth.uid()))
  with check (exists (select 1 from expenses e where e.id = expense_id and e.owner_id = auth.uid()));

-- ============ Trigger: auto-create profile + self-person on signup ============

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  display text;
begin
  display := coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1));
  insert into public.profiles (id, display_name) values (new.id, display);
  insert into public.people  (owner_id, name, is_self, color) values (new.id, display, true, '#10b981');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
