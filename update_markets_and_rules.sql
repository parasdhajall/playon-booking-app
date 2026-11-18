-- 1. FIX PLACE_BET: 10-Minute Buffer Rule (Booking counters close 10 min before result)
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
    -- Overnight market: booking closes at 10m before close and stays closed until 06:00 AM
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

  return bal;
end $$;

-- 2. INSERT / UPSERT REAL POPULAR DPBOSS MARKETS (Verified Official Timings)
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
