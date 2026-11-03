-- Supabase side of the sample: player profiles, matchmaker tickets and match results.
--
-- Who writes what:
--   players (browser, publishable key + their own session)  read everything public, rename themselves
--   Edge Function "matchmaking" (service role)               creates and updates their tickets
--   Edge Function "report-match" (service role)              records results through record_match()
-- The game server on Edgegap never gets a Supabase key: it calls report-match with a shared secret.

-- ---- profiles ------------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 16),
  wins integer not null default 0,
  matches_played integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are public"
  on public.profiles for select
  using (true);

create policy "Players rename themselves"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Players may change their name, never their wins.
revoke update on public.profiles from anon, authenticated;
grant update (display_name) on public.profiles to authenticated;

-- Every new user (anonymous sign-ins included) gets a profile.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, 'Player' || (100 + floor(random() * 900))::int);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---- matchmaker tickets --------------------------------------------------------------------

-- One row per Find Match, created by the matchmaking Edge Function: the player's matchmaker group
-- membership. The matchmaker fills in ticket_id when it matches the player; that id is what the
-- game server sees in MM_TICKET_IDS, so this table ties a ticket to a Supabase user.
create table public.tickets (
  id text primary key, -- matchmaker member_id
  ticket_id text unique,
  user_id uuid not null references auth.users on delete cascade,
  group_id text not null,
  profile text not null,
  status text not null default 'SEARCHING',
  connect_url text,
  match_id uuid,
  created_at timestamptz not null default now()
);

create index tickets_user_recent on public.tickets (user_id, created_at desc);

alter table public.tickets enable row level security;

create policy "Players see their own tickets"
  on public.tickets for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- ---- match results -------------------------------------------------------------------------

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  deployment_id text not null unique, -- ARBITRIUM_REQUEST_ID: one report per Edgegap deployment
  matchmaker_match_id text,
  profile text,
  result text,
  winner_id uuid references public.profiles on delete set null,
  ended_at timestamptz not null default now()
);

create table public.match_players (
  match_id uuid not null references public.matches on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  ticket_id text not null references public.tickets (ticket_id),
  score integer not null,
  place integer not null,
  primary key (match_id, user_id)
);

alter table public.matches enable row level security;
alter table public.match_players enable row level security;

create policy "Matches are public" on public.matches for select using (true);
create policy "Match players are public" on public.match_players for select using (true);

-- Records one finished match. Only the report-match Edge Function (service role) may call it.
-- Every player must come with the ticket the matchmaking function created for them, unused so
-- far: a server can only report players the matchmaker really sent it, once.
create function public.record_match(
  p_deployment_id text,
  p_matchmaker_match_id text,
  p_profile text,
  p_result text,
  p_winner_id uuid,
  p_players jsonb -- [{ticket_id, user_id, score, place}]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match_id uuid;
  v_player jsonb;
begin
  if jsonb_array_length(p_players) = 0 then
    raise exception 'no players';
  end if;

  for v_player in select * from jsonb_array_elements(p_players) loop
    perform 1 from public.tickets t
      where t.ticket_id = v_player->>'ticket_id'
        and t.user_id = (v_player->>'user_id')::uuid
        and t.match_id is null;
    if not found then
      raise exception 'ticket % does not belong to user % or was already used',
        v_player->>'ticket_id', v_player->>'user_id';
    end if;
  end loop;

  if p_winner_id is not null and not exists (
    select 1 from jsonb_array_elements(p_players) e where (e->>'user_id')::uuid = p_winner_id
  ) then
    raise exception 'winner % did not play', p_winner_id;
  end if;

  insert into public.matches (deployment_id, matchmaker_match_id, profile, result, winner_id)
  values (p_deployment_id, p_matchmaker_match_id, p_profile, p_result, p_winner_id)
  returning id into v_match_id;

  insert into public.match_players (match_id, user_id, ticket_id, score, place)
  select v_match_id, (e->>'user_id')::uuid, e->>'ticket_id', (e->>'score')::int, (e->>'place')::int
  from jsonb_array_elements(p_players) e;

  update public.tickets t set match_id = v_match_id
  where t.ticket_id in (select e->>'ticket_id' from jsonb_array_elements(p_players) e);

  update public.profiles p
  set matches_played = p.matches_played + 1,
      wins = p.wins + (case when p.id = p_winner_id then 1 else 0 end)
  where p.id in (select (e->>'user_id')::uuid from jsonb_array_elements(p_players) e);

  return v_match_id;
end;
$$;

revoke execute on function public.record_match from public, anon, authenticated;
grant execute on function public.record_match to service_role;

-- Live leaderboard: the page subscribes to profile changes through Supabase Realtime.
alter publication supabase_realtime add table public.profiles;
