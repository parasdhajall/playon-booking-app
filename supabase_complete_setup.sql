-- ==============================================================================
-- PLAYON / ONLINE MATKA BOOKING APP - COMPLETE ALL-IN-ONE SUPABASE SETUP
-- ==============================================================================
-- Paste this entire script into the Supabase SQL Editor and click RUN.
-- This sets up:
--   1. Extensions & Enums
--   2. Profiles & Role Management (First registered user becomes Master Admin)
--   3. 16 Popular DPBoss Markets with Official Timings & 10-Minute Buffer Rules
--   4. Betting Logic (Single, Jodi, Single/Double/Triple Panna, Sangam, Bucket Bets)
--   5. Live Result Declaration & Market Reset Functions
--   6. Admin Player Management (User listing, Points adjustment, Block/Unblock, Password reset)
--   7. Full Wallet System (UPI Settings, QR Code, Deposit/Withdrawal Requests & Passbook Ledger)
--   8. Row-Level Security (RLS) & Permissions
-- ==============================================================================

-- Enable required extensions
create extension if not exists "pgcrypto";

-- 1. ENUMS AND TYPES
do $$ begin
  create type public.app_role as enum ('admin', 'user');
exception
  when duplicate_object then null;
end $$;

-- 2. PROFILES TABLE
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  phone text,
  points integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.profiles add column if not exists phone text;
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

-- 3. USER ROLES TABLE
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique(user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

-- Role checking helper function (Security Definer)
create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id=_user_id and role=_role)
$$;

drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles for select to authenticated 
  using (id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "own roles read" on public.user_roles;
create policy "own roles read" on public.user_roles for select to authenticated 
  using (user_id = auth.uid());

-- 4. MARKETS TABLE
create table if not exists public.markets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  open_time time not null,
  close_time time not null,
  active boolean not null default true,
  open_panna text,
  close_panna text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
grant select on public.markets to anon, authenticated;
grant insert, update, delete on public.markets to authenticated;
grant all on public.markets to service_role;
alter table public.markets enable row level security;

drop policy if exists "markets public read" on public.markets;
create policy "markets public read" on public.markets for select to anon, authenticated using (true);

drop policy if exists "admin insert markets" on public.markets;
create policy "admin insert markets" on public.markets for insert to authenticated 
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists "admin update markets" on public.markets;
create policy "admin update markets" on public.markets for update to authenticated 
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "admin delete markets" on public.markets;
create policy "admin delete markets" on public.markets for delete to authenticated 
  using (public.has_role(auth.uid(), 'admin'));

-- 5. BETS TABLE
create table if not exists public.bets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  market_id uuid not null references public.markets(id) on delete cascade,
  game_type text not null,
  session text not null,
  number text not null,
  points integer not null check (points > 0),
  status text not null default 'pending' check (status in ('pending', 'won', 'lost', 'refunded')),
  payout integer not null default 0,
  created_at timestamptz not null default now()
);
grant select on public.bets to authenticated;
grant all on public.bets to service_role;
alter table public.bets enable row level security;

drop policy if exists "own bets read" on public.bets;
create policy "own bets read" on public.bets for select to authenticated 
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- 6. RESULTS HISTORY TABLE
create table if not exists public.results (
  id uuid primary key default gen_random_uuid(),
  market_id uuid not null references public.markets(id) on delete cascade,
  session text not null check (session in ('open', 'close')),
  panna text not null,
  result_date date not null default current_date,
  created_at timestamptz not null default now()
);
grant select on public.results to anon, authenticated;
grant all on public.results to service_role;
alter table public.results enable row level security;

drop policy if exists "results public read" on public.results;
create policy "results public read" on public.results for select to anon, authenticated using (true);

-- 7. SIGNUP TRIGGER (First registered account automatically becomes admin)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_phone text;
  v_name text;
begin
  v_phone := coalesce(new.raw_user_meta_data->>'phone', split_part(coalesce(new.email, new.phone, ''), '@', 1));
  v_name := coalesce(new.raw_user_meta_data->>'display_name', v_phone, 'Player');

  insert into public.profiles (id, display_name, phone, points)
  values (new.id, v_name, v_phone, 0)
  on conflict (id) do update set
    phone = excluded.phone,
    display_name = coalesce(public.profiles.display_name, excluded.display_name);

  -- First user registered becomes Master Admin
  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles(user_id, role) values (new.id, 'admin') on conflict do nothing;
  end if;

  insert into public.user_roles(user_id, role) values (new.id, 'user') on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Auto-confirm trigger for instant mobile registration
create or replace function public.auto_confirm_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email like '%@playon.app' or new.email like '%@playon.local' or new.email_confirmed_at is null then
    new.email_confirmed_at := coalesce(new.email_confirmed_at, now());
    new.confirmed_at := coalesce(new.confirmed_at, now());
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_auto_confirm on auth.users;
create trigger on_auth_user_auto_confirm
before insert on auth.users
for each row execute function public.auto_confirm_user();

-- 8. PANNA DIGIT CALCULATION HELPER
create or replace function public.panna_digit(p text) returns integer language sql immutable as $$
  select ((substr(p,1,1)::int + substr(p,2,1)::int + substr(p,3,1)::int) % 10)
$$;

-- 9. SEED 16 POPULAR DPBOSS MARKETS (Verified Official Timings)
insert into public.markets(name, open_time, close_time, sort_order) values
 ('MILAN MORNING', '10:30:00', '11:30:00', 1),
 ('SRIDEVI', '11:35:00', '12:35:00', 2),
 ('PADMAVATI', '11:40:00', '12:40:00', 3),
 ('KALYAN MORNING', '11:59:00', '12:59:00', 4),
 ('TIME BAZAR', '13:05:00', '14:05:00', 5),
 ('MADHUR DAY', '13:30:00', '14:30:00', 6),
 ('MILAN DAY', '15:05:00', '17:05:00', 7),
 ('RAJDHANI DAY', '15:15:00', '17:15:00', 8),
 ('KALYAN', '15:45:00', '17:45:00', 9),
 ('SRIDEVI NIGHT', '19:15:00', '20:15:00', 10),
 ('PADMAVATI NIGHT', '19:45:00', '20:45:00', 11),
 ('MADHUR NIGHT', '20:30:00', '22:30:00', 12),
 ('MILAN NIGHT', '21:05:00', '23:05:00', 13),
 ('RAJDHANI NIGHT', '21:35:00', '23:45:00', 14),
 ('KALYAN NIGHT', '21:40:00', '23:40:00', 15),
 ('MAIN BAZAR', '22:00:00', '00:10:00', 16)
on conflict do nothing;

-- 10. BETTING FUNCTION (PLACE_BET with 10-Minute Buffer Rule)
create or replace function public.place_bet(_market uuid, _game text, _session text, _number text, _points integer)
returns integer language plpgsql security definer set search_path = public as $$
declare
  m public.markets;
  bal integer;
  distinct_ct integer;
  now_t time;
  is_cross boolean;
  open_passed boolean;
  close_passed boolean;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if _points < 5 or _points > 10000 then raise exception 'Points must be between 5 and 10000'; end if;
  select * into m from public.markets where id=_market;
  if m.id is null or not m.active then raise exception 'Market is closed'; end if;

  now_t := (now() at time zone 'Asia/Kolkata')::time;
  is_cross := (m.close_time <= m.open_time);

  -- Has Open booking closed? (10-minute buffer before Open result)
  if not is_cross then
    open_passed := (now_t >= (m.open_time - interval '10 minutes')::time);
  else
    open_passed := (now_t >= (m.open_time - interval '10 minutes')::time or now_t < '06:00:00'::time);
  end if;

  -- Self-healing check: if open session hasn't arrived today, any result is leftover from previous day
  if not open_passed and (m.open_panna is not null or m.close_panna is not null) then
    update public.markets set open_panna = null, close_panna = null where id = _market;
    m.open_panna := null;
    m.close_panna := null;
  end if;

  -- Has Close booking closed? (10-minute buffer before Close result)
  if not is_cross then
    close_passed := (now_t >= (m.close_time - interval '10 minutes')::time);
  else
    if (m.close_time - interval '10 minutes')::time < m.open_time then
      close_passed := (now_t >= (m.close_time - interval '10 minutes')::time and now_t < '06:00:00'::time);
    else
      close_passed := (now_t >= (m.close_time - interval '10 minutes')::time or now_t < '06:00:00'::time);
    end if;
  end if;

  if m.close_panna is not null or close_passed then
    raise exception 'Market booking has closed for today (% counter closed at %)', m.name, to_char((m.close_time - interval '10 minutes')::time, 'HH12:MI AM');
  end if;

  -- Validate game type
  if _game not in ('single','jodi','single_panna','double_panna','triple_panna','half_sangam','full_sangam') then
    raise exception 'Invalid game type: %', _game;
  end if;

  -- Jodi and Sangam can only be played before Open booking counter closes
  if _game in ('jodi','half_sangam','full_sangam') then
    _session := 'close';
    if m.open_panna is not null or open_passed then
      raise exception 'Jodi & Sangam booking closed (% Open counter closed at %)', m.name, to_char((m.open_time - interval '10 minutes')::time, 'HH12:MI AM');
    end if;
  end if;

  if _session not in ('open','close') then
    raise exception 'Invalid session';
  end if;

  -- Open session bet check
  if _session = 'open' then
    if m.open_panna is not null or open_passed then
      raise exception 'Open session booking has closed for % (counter closed at %). Please play Close session.', m.name, to_char((m.open_time - interval '10 minutes')::time, 'HH12:MI AM');
    end if;
  end if;

  -- Validation of number patterns
  if _game = 'single_panna' then
    if _number !~ '^[0-9]{3}$' then raise exception 'Panna must be 3 digits'; end if;
    select count(distinct c) into distinct_ct from regexp_split_to_table(_number,'') c;
    if distinct_ct<>3 then raise exception 'Single panna needs 3 different digits'; end if;
  elsif _game like '%panna' then
    if _number !~ '^[0-9]{3}$' then raise exception 'Panna must be 3 digits'; end if;
    select count(distinct c) into distinct_ct from regexp_split_to_table(_number,'') c;
    if (_game='double_panna' and distinct_ct<>2) or (_game='triple_panna' and distinct_ct<>1) then
      raise exception 'Number does not match this panna type'; end if;
  elsif (_game='single' and _number !~ '^[0-9]$') or (_game='jodi' and _number !~ '^[0-9]{2}$')
     or (_game='half_sangam' and _number !~ '^[0-9]-[0-9]{3}$') or (_game='full_sangam' and _number !~ '^[0-9]{3}-[0-9]{3}$') then
    raise exception 'Invalid number format';
  end if;

  -- Deduct points and place bet
  select points into bal from public.profiles where id=auth.uid() for update;
  if bal < _points then raise exception 'Not enough points (Your balance: % points)', bal; end if;
  update public.profiles set points = points - _points where id=auth.uid() returning points into bal;

  insert into public.bets(user_id, market_id, game_type, session, number, points)
  values (auth.uid(), _market, _game, _session, _number, _points);

  -- Record in Passbook ledger
  insert into public.wallet_transactions (user_id, type, amount, balance_after, description)
  values (auth.uid(), 'bet_placed', -_points, bal, 'Bet placed on ' || m.name || ' (' || _game || ' ' || _number || ')');

  return bal;
end $$;

-- 11. BUCKET / BULK BETS FUNCTION
create or replace function public.place_bucket_bets(_market uuid, _bets jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m public.markets;
  bal integer;
  total_pts integer := 0;
  bet_item jsonb;
  b_game text;
  b_session text;
  b_num text;
  b_pts integer;
  distinct_ct integer;
  inserted_count integer := 0;
  now_t time;
  is_cross boolean;
  open_passed boolean;
  close_passed boolean;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if _bets is null or jsonb_array_length(_bets) = 0 then
    raise exception 'Empty bets payload';
  end if;

  select * into m from public.markets where id=_market;
  if m.id is null or not m.active then raise exception 'Market is closed'; end if;

  now_t := (now() at time zone 'Asia/Kolkata')::time;
  is_cross := (m.close_time <= m.open_time);

  if not is_cross then
    open_passed := (now_t >= (m.open_time - interval '10 minutes')::time);
  else
    open_passed := (now_t >= (m.open_time - interval '10 minutes')::time or now_t < '06:00:00'::time);
  end if;

  if not is_cross then
    close_passed := (now_t >= (m.close_time - interval '10 minutes')::time);
  else
    if (m.close_time - interval '10 minutes')::time < m.open_time then
      close_passed := (now_t >= (m.close_time - interval '10 minutes')::time and now_t < '06:00:00'::time);
    else
      close_passed := (now_t >= (m.close_time - interval '10 minutes')::time or now_t < '06:00:00'::time);
    end if;
  end if;

  if m.close_panna is not null or close_passed then
    raise exception 'Market booking has closed for today (% counter closed at %)', m.name, to_char((m.close_time - interval '10 minutes')::time, 'HH12:MI AM');
  end if;

  for bet_item in select * from jsonb_array_elements(_bets)
  loop
    b_game := bet_item->>'game';
    b_session := bet_item->>'session';
    b_num := bet_item->>'number';
    b_pts := (bet_item->>'points')::integer;

    if b_pts is null or b_pts < 5 or b_pts > 10000 then
      raise exception 'Points for number % must be between 5 and 10000', b_num;
    end if;

    if b_game in ('jodi','half_sangam','full_sangam') then
      b_session := 'close';
      if m.open_panna is not null or open_passed then
        raise exception '% booking closed (% Open counter closed at %)', b_game, m.name, to_char((m.open_time - interval '10 minutes')::time, 'HH12:MI AM');
      end if;
    end if;

    if b_session = 'open' and (m.open_panna is not null or open_passed) then
      raise exception 'Open session has closed for %', m.name;
    end if;

    total_pts := total_pts + b_pts;
  end loop;

  select points into bal from public.profiles where id = auth.uid() for update;
  if bal < total_pts then
    raise exception 'Not enough points (Required: % pts, Your Balance: % pts)', total_pts, bal;
  end if;

  update public.profiles set points = points - total_pts where id = auth.uid() returning points into bal;

  for bet_item in select * from jsonb_array_elements(_bets)
  loop
    b_game := bet_item->>'game';
    b_session := bet_item->>'session';
    b_num := bet_item->>'number';
    b_pts := (bet_item->>'points')::integer;
    if b_game in ('jodi','half_sangam','full_sangam') then
      b_session := 'close';
    end if;

    insert into public.bets(user_id, market_id, game_type, session, number, points)
    values (auth.uid(), _market, b_game, b_session, b_num, b_pts);
    inserted_count := inserted_count + 1;
  end loop;

  -- Record batch in Passbook ledger
  insert into public.wallet_transactions (user_id, type, amount, balance_after, description)
  values (auth.uid(), 'bet_placed', -total_pts, bal, 'Bucket bets placed on ' || m.name || ' (' || inserted_count || ' plays)');

  return jsonb_build_object('success', true, 'count', inserted_count, 'total_points', total_pts, 'balance', bal);
end $$;

-- 12. DECLARE RESULT FUNCTION (Panna, Jodi, Single Digit payout logic)
create or replace function public.declare_result(_market uuid, _session text, _panna text)
returns void language plpgsql security definer set search_path = public as $$
declare
  d integer;
  od integer;
  m public.markets;
  b record;
  win boolean;
  mult integer;
  user_win_map jsonb := '{}'::jsonb;
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'Forbidden: Admins only'; end if;
  if _panna !~ '^[0-9]{3}$' then raise exception 'Panna must be 3 digits'; end if;
  d := public.panna_digit(_panna);
  select * into m from public.markets where id=_market for update;

  if _session='open' then
    update public.markets set open_panna=_panna where id=_market;
    insert into public.results(market_id, session, panna) values (_market, 'open', _panna);

    for b in select * from public.bets where market_id=_market and session='open' and status='pending' loop
      win := false;
      mult := 0;
      if b.game_type='single' and b.number=d::text then win:=true; mult:=9;
      elsif b.game_type in ('single_panna','double_panna','triple_panna') and b.number=_panna then
        win:=true;
        mult := case b.game_type when 'single_panna' then 140 when 'double_panna' then 280 else 700 end;
      end if;

      if win then
        update public.bets set status='won', payout=b.points*mult where id=b.id;
        update public.profiles set points=points + (b.points*mult) where id=b.user_id;
        insert into public.wallet_transactions (user_id, type, amount, balance_after, reference_id, description)
        select b.user_id, 'bet_won', b.points*mult, p.points, b.id, 'Winning credited for ' || m.name || ' (' || b.game_type || ' ' || b.number || ')'
        from public.profiles p where p.id = b.user_id;
      else
        update public.bets set status='lost' where id=b.id;
      end if;
    end loop;

  elsif _session='close' then
    if m.open_panna is null then raise exception 'Must declare Open result first'; end if;
    od := public.panna_digit(m.open_panna);
    update public.markets set close_panna=_panna where id=_market;
    insert into public.results(market_id, session, panna) values (_market, 'close', _panna);

    for b in select * from public.bets where market_id=_market and session='close' and status='pending' loop
      win := false;
      mult := 0;
      if b.game_type='single' and b.number=d::text then win:=true; mult:=9;
      elsif b.game_type in ('single_panna','double_panna','triple_panna') and b.number=_panna then
        win:=true;
        mult := case b.game_type when 'single_panna' then 140 when 'double_panna' then 280 else 700 end;
      elsif b.game_type='jodi' and b.number = (od::text || d::text) then
        win:=true; mult:=90;
      elsif b.game_type='half_sangam' and (
        b.number = (od::text || '-' || _panna) or
        b.number = (d::text || '-' || m.open_panna)
      ) then
        win:=true; mult:=1000;
      elsif b.game_type='full_sangam' and b.number = (m.open_panna || '-' || _panna) then
        win:=true; mult:=10000;
      end if;

      if win then
        update public.bets set status='won', payout=b.points*mult where id=b.id;
        update public.profiles set points=points + (b.points*mult) where id=b.user_id;
        insert into public.wallet_transactions (user_id, type, amount, balance_after, reference_id, description)
        select b.user_id, 'bet_won', b.points*mult, p.points, b.id, 'Winning credited for ' || m.name || ' (' || b.game_type || ' ' || b.number || ')'
        from public.profiles p where p.id = b.user_id;
      else
        update public.bets set status='lost' where id=b.id;
      end if;
    end loop;
  end if;
end $$;

-- 13. RESET MARKET (Resets for a new booking day)
create or replace function public.reset_market(_market uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'Forbidden: Admins only'; end if;
  update public.profiles p set points = p.points + s.total
  from (
    select user_id, sum(points) total
    from public.bets
    where market_id=_market and status='pending' and created_at < current_date
    group by user_id
  ) s
  where p.id = s.user_id;

  update public.bets set status='refunded'
  where market_id=_market and status='pending' and created_at < current_date;

  update public.markets set open_panna=null, close_panna=null where id=_market;
end $$;

-- Auto-reset stale markets from previous day
create or replace function public.auto_reset_stale_markets()
returns void language plpgsql security definer set search_path = public as $$
declare
  stale_market record;
  now_t time;
  is_cross boolean;
  close_passed boolean;
begin
  now_t := (now() at time zone 'Asia/Kolkata')::time;

  for stale_market in
    select id, name, open_time, close_time
    from public.markets
    where open_panna is not null or close_panna is not null
  loop
    is_cross := (stale_market.close_time <= stale_market.open_time);
    if not is_cross then
      close_passed := (now_t >= (stale_market.close_time - interval '10 minutes')::time);
    else
      if (stale_market.close_time - interval '10 minutes')::time < stale_market.open_time then
        close_passed := (now_t >= (stale_market.close_time - interval '10 minutes')::time and now_t < '06:00:00'::time);
      else
        close_passed := (now_t >= (stale_market.close_time - interval '10 minutes')::time or now_t < '06:00:00'::time);
      end if;
    end if;

    if not close_passed then
      update public.markets set open_panna = null, close_panna = null where id = stale_market.id;
    end if;
  end loop;
end $$;

-- 14. ADMIN PLAYER MANAGEMENT FUNCTIONS
-- List all registered users
create or replace function public.admin_get_all_users()
returns table (
  id uuid,
  email text,
  display_name text,
  points integer,
  is_blocked boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz
) language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Forbidden: Admins only'; end if;
  return query
  select
    u.id,
    coalesce(u.email, p.phone || '@playon.app') as email,
    coalesce(p.display_name, split_part(u.email, '@', 1)) as display_name,
    coalesce(p.points, 0) as points,
    coalesce((u.banned_until > now()), false) as is_blocked,
    u.created_at,
    u.last_sign_in_at
  from auth.users u
  join public.profiles p on p.id = u.id
  order by u.created_at desc;
end $$;

-- Adjust points directly
create or replace function public.admin_adjust_points(_user_id uuid, _points integer)
returns integer language plpgsql security definer set search_path = public as $$
declare new_bal integer;
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Forbidden: Admins only'; end if;
  update public.profiles set points = points + _points where id = _user_id returning points into new_bal;
  insert into public.wallet_transactions (user_id, type, amount, balance_after, description)
  values (_user_id, 'admin_adjustment', _points, new_bal, 'Admin points adjustment');
  return new_bal;
end $$;

-- Block or unblock a player
create or replace function public.admin_toggle_user_block(_user_id uuid, _blocked boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Forbidden: Admins only'; end if;
  if _blocked then
    update auth.users set banned_until = '2099-01-01 00:00:00+00' where id = _user_id;
  else
    update auth.users set banned_until = null where id = _user_id;
  end if;
end $$;

-- Admin update player password
create or replace function public.admin_set_user_password(_user_id uuid, _new_password text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Forbidden: Admins only'; end if;
  update auth.users
  set encrypted_password = crypt(_new_password, gen_salt('bf'))
  where id = _user_id;
end $$;

-- Delete player account safely
create or replace function public.admin_delete_user(_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'Forbidden: Admin access required'; end if;
  if _user_id = auth.uid() then raise exception 'Cannot delete your own admin account'; end if;

  delete from public.bets where user_id = _user_id;
  delete from public.wallet_transactions where user_id = _user_id;
  delete from public.deposit_requests where user_id = _user_id;
  delete from public.withdrawal_requests where user_id = _user_id;
  delete from public.user_roles where user_id = _user_id;
  delete from public.profiles where id = _user_id;
  delete from auth.users where id = _user_id;
end $$;

-- 15. PAYMENT & WALLET SYSTEM TABLES
create table if not exists public.payment_settings (
  id uuid primary key default gen_random_uuid(),
  upi_id text not null default 'admin@upi',
  account_name text not null default 'Game Admin',
  qr_image_url text default '',
  min_deposit integer not null default 100,
  max_deposit integer not null default 50000,
  min_withdrawal integer not null default 500,
  max_withdrawal integer not null default 50000,
  deposit_notice text default 'Payment ke baad 12-digit UTR/Ref Number daalein. 5-10 min mein points add ho jayenge.',
  withdrawal_notice text default 'Withdrawal timing: 10:00 AM se 08:00 PM. Direct aapke UPI par transfer hoga.',
  is_deposit_active boolean not null default true,
  is_withdrawal_active boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.payment_settings (upi_id, account_name, min_deposit, min_withdrawal)
select 'admin@upi', 'Game Admin', 100, 500
where not exists (select 1 from public.payment_settings);

grant select on public.payment_settings to anon, authenticated;
grant all on public.payment_settings to service_role;
grant update on public.payment_settings to authenticated;
alter table public.payment_settings enable row level security;

drop policy if exists "payment_settings_read" on public.payment_settings;
create policy "payment_settings_read" on public.payment_settings for select using (true);

drop policy if exists "payment_settings_admin_write" on public.payment_settings;
create policy "payment_settings_admin_write" on public.payment_settings for all to authenticated using (public.has_role(auth.uid(), 'admin'));

-- Deposit Requests
create table if not exists public.deposit_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null check (amount >= 50),
  utr_number text not null,
  screenshot_url text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

grant select, insert on public.deposit_requests to authenticated;
grant all on public.deposit_requests to service_role;
alter table public.deposit_requests enable row level security;

drop policy if exists "own_deposit_read" on public.deposit_requests;
create policy "own_deposit_read" on public.deposit_requests for select to authenticated 
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

drop policy if exists "own_deposit_insert" on public.deposit_requests;
create policy "own_deposit_insert" on public.deposit_requests for insert to authenticated 
  with check (user_id = auth.uid());

-- Withdrawal Requests
create table if not exists public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null check (amount >= 100),
  payout_method text not null default 'upi' check (payout_method in ('upi', 'bank')),
  upi_id text,
  account_holder_name text,
  bank_name text,
  account_number text,
  ifsc_code text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

grant select, insert on public.withdrawal_requests to authenticated;
grant all on public.withdrawal_requests to service_role;
alter table public.withdrawal_requests enable row level security;

drop policy if exists "own_withdrawal_read" on public.withdrawal_requests;
create policy "own_withdrawal_read" on public.withdrawal_requests for select to authenticated 
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- Wallet Transactions (Passbook Ledger)
create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('deposit', 'withdrawal', 'bet_placed', 'bet_won', 'admin_adjustment', 'withdrawal_refund')),
  amount integer not null,
  balance_after integer not null,
  reference_id uuid,
  description text not null,
  created_at timestamptz not null default now()
);

grant select on public.wallet_transactions to authenticated;
grant all on public.wallet_transactions to service_role;
alter table public.wallet_transactions enable row level security;

drop policy if exists "own_wallet_tx_read" on public.wallet_transactions;
create policy "own_wallet_tx_read" on public.wallet_transactions for select to authenticated 
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- 16. WALLET FUNCTIONS & RPCS
create or replace function public.submit_withdrawal_request(
  p_amount integer,
  p_upi_id text,
  p_account_holder text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_current_points integer;
  v_new_balance integer;
  v_req_id uuid;
  v_min_with integer;
begin
  if v_user_id is null then raise exception 'Unauthorized'; end if;
  select min_withdrawal into v_min_with from public.payment_settings limit 1;
  v_min_with := coalesce(v_min_with, 100);

  if p_amount < v_min_with then raise exception 'Minimum withdrawal amount is ₹%', v_min_with; end if;
  if trim(coalesce(p_upi_id, '')) = '' then raise exception 'Valid UPI ID is required'; end if;

  select points into v_current_points from public.profiles where id = v_user_id for update;
  if v_current_points is null or v_current_points < p_amount then
    raise exception 'Insufficient balance. Available: ₹%, Requested: ₹%', coalesce(v_current_points, 0), p_amount;
  end if;

  v_new_balance := v_current_points - p_amount;
  update public.profiles set points = v_new_balance where id = v_user_id;

  insert into public.withdrawal_requests (user_id, amount, upi_id, account_holder_name, status)
  values (v_user_id, p_amount, trim(p_upi_id), trim(p_account_holder), 'pending')
  returning id into v_req_id;

  insert into public.wallet_transactions (user_id, type, amount, balance_after, reference_id, description)
  values (v_user_id, 'withdrawal', -p_amount, v_new_balance, v_req_id, 'Withdrawal request submitted for UPI: ' || trim(p_upi_id));

  return v_req_id;
end $$;

create or replace function public.approve_deposit_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_admin_id uuid := auth.uid();
  v_req record;
  v_new_balance integer;
begin
  if not public.has_role(v_admin_id, 'admin') then raise exception 'Admin access required'; end if;

  select * into v_req from public.deposit_requests where id = p_request_id for update;
  if not found then raise exception 'Deposit request not found'; end if;
  if v_req.status <> 'pending' then raise exception 'Request is already %', v_req.status; end if;

  update public.profiles
  set points = points + v_req.amount
  where id = v_req.user_id
  returning points into v_new_balance;

  update public.deposit_requests
  set status = 'approved', reviewed_by = v_admin_id, reviewed_at = now()
  where id = p_request_id;

  insert into public.wallet_transactions (user_id, type, amount, balance_after, reference_id, description)
  values (v_req.user_id, 'deposit', v_req.amount, v_new_balance, p_request_id, 'Deposit approved via UTR: ' || v_req.utr_number);
end $$;

create or replace function public.reject_deposit_request(p_request_id uuid, p_reason text default 'Invalid UTR or payment not received')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Admin access required'; end if;
  update public.deposit_requests
  set status = 'rejected', rejection_reason = p_reason, reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_request_id and status = 'pending';
end $$;

create or replace function public.approve_withdrawal_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Admin access required'; end if;
  update public.withdrawal_requests
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_request_id and status = 'pending';
end $$;

create or replace function public.reject_withdrawal_request(p_request_id uuid, p_reason text default 'Incorrect UPI or payment issue')
returns void language plpgsql security definer set search_path = public as $$
declare
  v_req record;
  v_new_balance integer;
begin
  if not public.has_role(auth.uid(), 'admin') then raise exception 'Admin access required'; end if;

  select * into v_req from public.withdrawal_requests where id = p_request_id for update;
  if not found then raise exception 'Withdrawal request not found'; end if;
  if v_req.status <> 'pending' then raise exception 'Request is already %', v_req.status; end if;

  update public.profiles set points = points + v_req.amount where id = v_req.user_id returning points into v_new_balance;

  update public.withdrawal_requests
  set status = 'rejected', rejection_reason = p_reason, reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_request_id;

  insert into public.wallet_transactions (user_id, type, amount, balance_after, reference_id, description)
  values (v_req.user_id, 'withdrawal_refund', v_req.amount, v_new_balance, p_request_id, 'Withdrawal rejected: ' || p_reason || ' (Refunded to wallet)');
end $$;

-- 17. GRANTS FOR EXECUTE
grant execute on function public.place_bet(uuid,text,text,text,integer) to authenticated;
grant execute on function public.place_bucket_bets(uuid, jsonb) to authenticated;
grant execute on function public.declare_result(uuid,text,text) to authenticated;
grant execute on function public.reset_market(uuid) to authenticated;
grant execute on function public.auto_reset_stale_markets() to authenticated, anon;
grant execute on function public.admin_get_all_users() to authenticated;
grant execute on function public.admin_adjust_points(uuid, integer) to authenticated;
grant execute on function public.admin_toggle_user_block(uuid, boolean) to authenticated;
grant execute on function public.admin_set_user_password(uuid, text) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
grant execute on function public.submit_withdrawal_request(integer, text, text) to authenticated;
grant execute on function public.approve_deposit_request(uuid) to authenticated;
grant execute on function public.reject_deposit_request(uuid, text) to authenticated;
grant execute on function public.approve_withdrawal_request(uuid) to authenticated;
grant execute on function public.reject_withdrawal_request(uuid, text) to authenticated;
