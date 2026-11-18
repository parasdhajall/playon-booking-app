-- 0003: Update all 16 official DPBoss market timings & enforce 10-minute booking counter buffer
-- 1. UPDATE MARKET TIMINGS
update public.markets set open_time = '10:30:00', close_time = '11:30:00', active = true where upper(trim(name)) = 'MILAN MORNING';
update public.markets set open_time = '11:35:00', close_time = '12:35:00', active = true where upper(trim(name)) = 'SRIDEVI';
update public.markets set open_time = '11:40:00', close_time = '12:40:00', active = true where upper(trim(name)) in ('PADMAVATI', 'PADMAVATHI');
update public.markets set open_time = '11:59:00', close_time = '12:59:00', active = true where upper(trim(name)) = 'KALYAN MORNING';
update public.markets set open_time = '13:05:00', close_time = '14:05:00', active = true where upper(trim(name)) = 'TIME BAZAR';
update public.markets set open_time = '13:30:00', close_time = '14:30:00', active = true where upper(trim(name)) = 'MADHUR DAY';
update public.markets set open_time = '15:05:00', close_time = '17:05:00', active = true where upper(trim(name)) = 'MILAN DAY';
update public.markets set open_time = '15:15:00', close_time = '17:15:00', active = true where upper(trim(name)) = 'RAJDHANI DAY';
update public.markets set open_time = '15:45:00', close_time = '17:45:00', active = true where upper(trim(name)) = 'KALYAN';
update public.markets set open_time = '19:15:00', close_time = '20:15:00', active = true where upper(trim(name)) = 'SRIDEVI NIGHT';
update public.markets set open_time = '19:45:00', close_time = '20:45:00', active = true where upper(trim(name)) in ('PADMAVATI NIGHT', 'PADMAVATHI NIGHT');
update public.markets set open_time = '20:30:00', close_time = '22:30:00', active = true where upper(trim(name)) = 'MADHUR NIGHT';
update public.markets set open_time = '21:05:00', close_time = '23:05:00', active = true where upper(trim(name)) = 'MILAN NIGHT';
update public.markets set open_time = '21:35:00', close_time = '23:45:00', active = true where upper(trim(name)) = 'RAJDHANI NIGHT';
update public.markets set open_time = '21:40:00', close_time = '23:40:00', active = true where upper(trim(name)) = 'KALYAN NIGHT';
update public.markets set open_time = '22:00:00', close_time = '00:10:00', active = true where upper(trim(name)) = 'MAIN BAZAR';

-- 2. ENFORCE 10-MINUTE BUFFER IN PLACE_BET
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

  -- Open booking closes 10 minutes before Open result
  if not is_cross then
    open_passed := (now_t >= (m.open_time - interval '10 minutes')::time);
  else
    open_passed := (now_t >= (m.open_time - interval '10 minutes')::time or now_t < '06:00:00'::time);
  end if;

  -- Self-healing check
  if not open_passed and (m.open_panna is not null or m.close_panna is not null) then
    update public.markets set open_panna = null, close_panna = null where id = _market;
    m.open_panna := null;
    m.close_panna := null;
  end if;

  -- Close booking closes 10 minutes before Close result
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

  if _game not in ('single','jodi','single_panna','double_panna','triple_panna','half_sangam','full_sangam') then
    raise exception 'Invalid game type: %', _game;
  end if;

  if _game in ('jodi','half_sangam','full_sangam') then
    _session := 'close';
    if m.open_panna is not null or open_passed then
      raise exception 'Jodi & Sangam booking closed (% Open counter closed at %)', m.name, to_char((m.open_time - interval '10 minutes')::time, 'HH12:MI AM');
    end if;
  end if;

  if _session not in ('open','close') then
    raise exception 'Invalid session';
  end if;

  if _session = 'open' and (m.open_panna is not null or open_passed) then
    raise exception 'Open session booking has closed for % (counter closed at %). Please play Close session.', m.name, to_char((m.open_time - interval '10 minutes')::time, 'HH12:MI AM');
  end if;

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

  select points into bal from public.profiles where id=auth.uid() for update;
  if bal < _points then raise exception 'Not enough points (Your balance: % points)', bal; end if;
  update public.profiles set points = points - _points where id=auth.uid() returning points into bal;
  insert into public.bets(user_id, market_id, game_type, session, number, points)
  values (auth.uid(), _market, _game, _session, _number, _points);

  return bal;
end $$;

-- 3. ENFORCE 10-MINUTE BUFFER IN PLACE_BUCKET_BETS
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
  now_t time;
  is_cross boolean;
  open_passed boolean;
  close_passed boolean;
  inserted_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if jsonb_array_length(_bets) = 0 then raise exception 'Bucket is empty'; end if;

  select * into m from public.markets where id=_market;
  if m.id is null or not m.active then raise exception 'Market closed'; end if;

  now_t := (now() at time zone 'Asia/Kolkata')::time;
  is_cross := (m.close_time <= m.open_time);

  -- Open booking closes 10 minutes before Open result
  if not is_cross then
    open_passed := (now_t >= (m.open_time - interval '10 minutes')::time);
  else
    open_passed := (now_t >= (m.open_time - interval '10 minutes')::time or now_t < '06:00:00'::time);
  end if;

  -- Self-healing check
  if not open_passed and (m.open_panna is not null or m.close_panna is not null) then
    update public.markets set open_panna = null, close_panna = null where id = _market;
    m.open_panna := null;
    m.close_panna := null;
  end if;

  -- Close booking closes 10 minutes before Close result
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

    if b_game not in ('single','jodi','single_panna','double_panna','triple_panna','half_sangam','full_sangam') then
      raise exception 'Invalid game type: %', b_game;
    end if;

    if b_game in ('jodi','half_sangam','full_sangam') then
      b_session := 'close';
      if m.open_panna is not null or open_passed then
        raise exception '% can only be played before Open timing (% Open counter closed at %)', b_game, m.name, to_char((m.open_time - interval '10 minutes')::time, 'HH12:MI AM');
      end if;
    end if;

    if b_session not in ('open','close') then
      raise exception 'Invalid session for %', b_num;
    end if;

    if b_session = 'open' and (m.open_panna is not null or open_passed) then
      raise exception 'Open session has closed for % (Open counter closed at %). Please play Close session.', m.name, to_char((m.open_time - interval '10 minutes')::time, 'HH12:MI AM');
    end if;

    if b_game = 'single_panna' then
      if b_num !~ '^[0-9]{3}$' then raise exception 'Panna must be 3 digits: %', b_num; end if;
      select count(distinct c) into distinct_ct from regexp_split_to_table(b_num,'') c;
      if distinct_ct <> 3 then raise exception 'Single panna needs 3 different digits: %', b_num; end if;
    elsif b_game like '%panna' then
      if b_num !~ '^[0-9]{3}$' then raise exception 'Panna must be 3 digits: %', b_num; end if;
      select count(distinct c) into distinct_ct from regexp_split_to_table(b_num,'') c;
      if (b_game='double_panna' and distinct_ct <> 2) or (b_game='triple_panna' and distinct_ct <> 1) then
        raise exception 'Number % does not match %', b_num, b_game;
      end if;
    elsif (b_game='single' and b_num !~ '^[0-9]$') or (b_game='jodi' and b_num !~ '^[0-9]{2}$')
       or (b_game='half_sangam' and b_num !~ '^[0-9]-[0-9]{3}$') or (b_game='full_sangam' and b_num !~ '^[0-9]{3}-[0-9]{3}$') then
      raise exception 'Invalid number format: %', b_num;
    end if;

    total_pts := total_pts + b_pts;
  end loop;

  update public.profiles set points = points - total_pts where id = auth.uid() returning points into bal;

  for bet_item in select * from jsonb_array_elements(_bets)
  loop
    b_game := bet_item->>'game';
    b_session := bet_item->>'session';
    b_num := bet_item->>'number';
    b_pts := (bet_item->>'points')::integer;
    if b_game in ('jodi','half_sangam','full_sangam') then b_session := 'close'; end if;

    insert into public.bets(user_id, market_id, game_type, session, number, points)
    values (auth.uid(), _market, b_game, b_session, b_num, b_pts);
    inserted_count := inserted_count + 1;
  end loop;

  return jsonb_build_object('success', true, 'count', inserted_count, 'new_balance', bal);
end $$;

grant execute on function public.place_bucket_bets(uuid, jsonb) to authenticated;
grant execute on function public.place_bet(uuid, text, text, text, integer) to authenticated;
