-- ==============================================================================
-- 4:00 AM AUTO RESET & SYSTEM AUTO DECLARE STORED PROCEDURES
-- ==============================================================================

-- 1. SYSTEM RESET AT 4:00 AM IST (Runs without admin browser session)
create or replace function public.system_reset_at_4am()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
  reset_count integer := 0;
  refunded_bets_count integer := 0;
  now_ist timestamptz;
  today_4am timestamptz;
begin
  now_ist := now() at time zone 'Asia/Kolkata';
  
  -- Calculate today's 4:00 AM cutoff timestamp
  today_4am := (date_trunc('day', now_ist) + interval '4 hours') at time zone 'Asia/Kolkata';

  -- 1. Refund all pending bets placed before today's 4:00 AM IST
  update public.profiles p set points = p.points + s.total
  from (
    select user_id, sum(points) as total
    from public.bets
    where status = 'pending'
      and created_at < today_4am
    group by user_id
  ) s
  where p.id = s.user_id;

  update public.bets
  set status = 'refunded'
  where status = 'pending'
    and created_at < today_4am;

  get diagnostics refunded_bets_count = row_count;

  -- 2. Reset open_panna and close_panna on ALL markets so new day starts fresh
  update public.markets
  set open_panna = null,
      close_panna = null
  where open_panna is not null or close_panna is not null;

  get diagnostics reset_count = row_count;

  return jsonb_build_object(
    'status', 'success',
    'reset_at', now(),
    'reset_at_ist', now_ist,
    'markets_cleared', reset_count,
    'bets_refunded', refunded_bets_count
  );
end;
$$;

-- 2. SYSTEM AUTO-DECLARE RESULT (Runs without admin session)
create or replace function public.system_auto_declare_result(
  _market uuid,
  _session text,
  _panna text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d integer;
  od integer;
  m public.markets;
  b record;
  win boolean;
  mult integer;
  payout_pts integer;
  declared_date date;
  updated_bets integer := 0;
begin
  if _panna !~ '^[0-9]{3}$' then
    raise exception 'Panna must be 3 digits';
  end if;

  d := public.panna_digit(_panna);
  select * into m from public.markets where id = _market for update;
  if not found then
    raise exception 'Market not found';
  end if;

  declared_date := (now() at time zone 'Asia/Kolkata')::date;

  if _session = 'open' then
    -- If open is already declared with same panna, return safely
    if m.open_panna = _panna then
      return jsonb_build_object('status', 'already_declared', 'market', m.name, 'session', 'open', 'panna', _panna);
    end if;
    update public.markets set open_panna = _panna where id = _market;
  elsif _session = 'close' then
    if m.close_panna = _panna then
      return jsonb_build_object('status', 'already_declared', 'market', m.name, 'session', 'close', 'panna', _panna);
    end if;
    if m.open_panna is null then
      raise exception 'Declare open result first';
    end if;
    update public.markets set close_panna = _panna where id = _market;
    od := public.panna_digit(m.open_panna);
  else
    raise exception 'Invalid session: %', _session;
  end if;

  insert into public.results(market_id, session, panna, result_date)
  values (_market, _session, _panna, declared_date)
  on conflict (market_id, result_date, session) do update set panna = excluded.panna;

  -- Process all pending bets for this market and session
  for b in select * from public.bets where market_id = _market and status = 'pending' and session = _session loop
    win := false;
    mult := 0;
    case b.game_type
      when 'single' then win := (b.number = d::text); mult := 9;
      when 'single_panna' then win := (b.number = _panna); mult := 140;
      when 'double_panna' then win := (b.number = _panna); mult := 280;
      when 'triple_panna' then win := (b.number = _panna); mult := 700;
      when 'jodi' then
        if _session = 'close' and od is not null then
          win := (b.number = (od::text || d::text)); mult := 90;
        end if;
      when 'half_sangam' then
        if _session = 'close' and od is not null then
          win := (b.number = (od::text || '-' || _panna)) or (b.number = (m.open_panna || '-' || d::text));
          mult := 1000;
        end if;
      when 'full_sangam' then
        if _session = 'close' and m.open_panna is not null then
          win := (b.number = (m.open_panna || '-' || _panna));
          mult := 10000;
        end if;
      else
        win := false;
    end case;

    if win then
      payout_pts := b.points * mult;
      update public.bets set status = 'won', payout = payout_pts where id = b.id;
      update public.profiles set points = points + payout_pts where id = b.user_id;
      
      -- If wallet_transactions ledger table exists, record winning
      if exists (select 1 from information_schema.tables where table_name = 'wallet_transactions' and table_schema = 'public') then
        insert into public.wallet_transactions (user_id, type, amount, balance_after, reference_id, description)
        select b.user_id, 'bet_won', payout_pts, points, b.id, 'Winning payout for ' || m.name || ' (' || b.game_type || ' ' || b.number || ')'
        from public.profiles where id = b.user_id;
      end if;
    else
      -- If session is close and it's jodi/sangam, mark lost
      if _session = 'close' or (b.game_type in ('single', 'single_panna', 'double_panna', 'triple_panna')) then
        update public.bets set status = 'lost', payout = 0 where id = b.id;
      end if;
    end if;

    updated_bets := updated_bets + 1;
  end loop;

  return jsonb_build_object(
    'status', 'success',
    'market', m.name,
    'session', _session,
    'panna', _panna,
    'digit', d,
    'bets_processed', updated_bets
  );
end;
$$;

grant execute on function public.system_reset_at_4am() to anon, authenticated, service_role;
grant execute on function public.system_auto_declare_result(uuid, text, text) to anon, authenticated, service_role;

-- 3. (OPTIONAL) SUPABASE PG_CRON SETUP SCRIPT:
-- Run this in Supabase SQL Editor if pg_cron is enabled in your Supabase project:
-- select cron.schedule('daily-reset-4am-ist', '30 22 * * *', 'select public.system_reset_at_4am();');
-- (Note: 22:30 UTC = 04:00 AM IST)
