-- Splitly schema — hybrid multi-tenant model.
-- Each group has members. A member is either a registered user (user_id set)
-- or a contact (user_id null, just a name for split-tracking).
-- Registered members can see + edit the group; contacts cannot log in.
--
-- Run via SQL Editor → paste → Run, OR via Management API.

-- ============ Wipe old (idempotent re-run support) ============

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists handle_new_user() cascade;
drop function if exists is_group_member(uuid, uuid) cascade;
drop table if exists notifications   cascade;
drop table if exists events          cascade;
drop table if exists expense_splits  cascade;
drop table if exists expenses        cascade;
drop table if exists group_members   cascade;
drop table if exists groups          cascade;
drop table if exists people          cascade;
drop table if exists profiles        cascade;

-- ============ Tables ============

create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  display_name text not null,
  color        text not null default '#10b981',
  created_at   timestamptz not null default now()
);
create index profiles_email_idx on profiles (lower(email));

create table groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  emoji       text default '👥',
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table group_members (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references groups(id) on delete cascade,
  -- user_id is null when this member is just a contact (no app account).
  user_id       uuid references auth.users(id) on delete cascade,
  display_name  text not null,
  color         text not null default '#10b981',
  added_by      uuid references auth.users(id) on delete set null,
  added_at      timestamptz not null default now(),
  -- Prevent the same user being added twice to the same group.
  unique (group_id, user_id)
);
create index group_members_user_idx  on group_members (user_id);
create index group_members_group_idx on group_members (group_id);

create table expenses (
  id                 uuid primary key default gen_random_uuid(),
  group_id           uuid not null references groups(id) on delete cascade,
  description        text not null,
  amount             numeric(12,2) not null check (amount > 0),
  paid_by_member_id  uuid not null references group_members(id) on delete cascade,
  type               text not null default 'expense' check (type in ('expense','settlement')),
  created_by         uuid references auth.users(id) on delete set null,
  date               timestamptz not null default now()
);
create index expenses_group_date_idx on expenses (group_id, date desc);

create table expense_splits (
  expense_id  uuid not null references expenses(id) on delete cascade,
  member_id   uuid not null references group_members(id) on delete cascade,
  primary key (expense_id, member_id)
);

create table events (
  id        uuid primary key default gen_random_uuid(),
  group_id  uuid references groups(id) on delete cascade,
  type      text not null,
  actor_id  uuid references auth.users(id) on delete set null,
  label     text not null,
  payload   jsonb default '{}',
  ts        timestamptz not null default now()
);
create index events_group_ts_idx on events (group_id, ts desc);

create table notifications (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users(id) on delete cascade,
  message   text not null,
  read      boolean not null default false,
  group_id  uuid references groups(id) on delete cascade,
  ts        timestamptz not null default now()
);
create index notifications_user_ts_idx on notifications (user_id, ts desc);

-- ============ Helper function (avoids policy recursion) ============

create or replace function is_group_member(g uuid, u uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from group_members gm where gm.group_id = g and gm.user_id = u
  );
$$;

-- ============ Row-Level Security ============

alter table profiles        enable row level security;
alter table groups          enable row level security;
alter table group_members   enable row level security;
alter table expenses        enable row level security;
alter table expense_splits  enable row level security;
alter table events          enable row level security;
alter table notifications   enable row level security;

-- Profiles: anyone signed in can read (needed for the member picker by email).
-- Only the owner can write their own row.
create policy "profiles readable" on profiles for select using (auth.uid() is not null);
create policy "profiles own write" on profiles for all
  using (id = auth.uid()) with check (id = auth.uid());

-- Groups: visible if you're a member OR you created it.
create policy "see groups you're in" on groups for select
  using (is_group_member(id, auth.uid()) or created_by = auth.uid());
create policy "create groups" on groups for insert
  with check (created_by = auth.uid());
create policy "creator updates" on groups for update
  using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "creator deletes" on groups for delete
  using (created_by = auth.uid());

-- Group members: visible if you're a member of the group, or you added the row.
create policy "see members of your groups" on group_members for select
  using (is_group_member(group_id, auth.uid()) or added_by = auth.uid());
create policy "add members" on group_members for insert
  with check (
    -- Either you're already a member of the group, OR you're the creator
    -- bootstrapping yourself (added_by = auth.uid() AND adding self user row).
    is_group_member(group_id, auth.uid()) or added_by = auth.uid()
  );
create policy "remove members" on group_members for delete
  using (is_group_member(group_id, auth.uid()));

-- Expenses
create policy "see expenses of your groups" on expenses for select
  using (is_group_member(group_id, auth.uid()));
create policy "add expenses" on expenses for insert
  with check (is_group_member(group_id, auth.uid()) and created_by = auth.uid());
create policy "delete your expenses" on expenses for delete
  using (created_by = auth.uid() and is_group_member(group_id, auth.uid()));

-- Expense splits: visible/editable if the parent expense is.
create policy "see splits" on expense_splits for select using (
  exists (
    select 1 from expenses e
    where e.id = expense_splits.expense_id
      and is_group_member(e.group_id, auth.uid())
  )
);
create policy "write splits" on expense_splits for insert with check (
  exists (
    select 1 from expenses e
    where e.id = expense_splits.expense_id
      and is_group_member(e.group_id, auth.uid())
  )
);
create policy "delete splits" on expense_splits for delete using (
  exists (
    select 1 from expenses e
    where e.id = expense_splits.expense_id
      and is_group_member(e.group_id, auth.uid())
  )
);

-- Events: visible to group members.
create policy "see events" on events for select
  using (group_id is null or is_group_member(group_id, auth.uid()));
create policy "log events" on events for insert
  with check (group_id is null or is_group_member(group_id, auth.uid()));

-- Notifications: yours only.
create policy "own notifs" on notifications for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ============ Trigger: create profile on signup ============

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
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, display)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============ Backfill profiles for any existing auth users ============

insert into public.profiles (id, email, display_name)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1))
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);
