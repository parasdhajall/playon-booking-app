-- ==============================================================================
-- ONLINE MATKA BOOKING APP - WALLET & TRANSACTIONS SCHEMA
-- ==============================================================================

-- 1. PAYMENT SETTINGS TABLE (Admin's UPI ID, QR Code, Limits)
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

-- Seed initial default settings if empty
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

-- 2. DEPOSIT REQUESTS TABLE
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

-- 3. WITHDRAWAL REQUESTS TABLE
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

grant select on public.withdrawal_requests to authenticated;
grant all on public.withdrawal_requests to service_role;
alter table public.withdrawal_requests enable row level security;

drop policy if exists "own_withdrawal_read" on public.withdrawal_requests;
create policy "own_withdrawal_read" on public.withdrawal_requests for select to authenticated 
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- 4. WALLET TRANSACTIONS (PASSBOOK LEDGER)
create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('deposit', 'withdrawal', 'bet_placed', 'bet_won', 'admin_adjustment', 'withdrawal_refund')),
  amount integer not null, -- positive for credit, negative for debit
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

-- 5. RPC: SUBMIT WITHDRAWAL REQUEST (Deducts points immediately to prevent double-spending)
create or replace function public.submit_withdrawal_request(
  p_amount integer,
  p_upi_id text,
  p_account_holder text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_points integer;
  v_new_balance integer;
  v_req_id uuid;
  v_min_with integer;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  select min_withdrawal into v_min_with from public.payment_settings limit 1;
  v_min_with := coalesce(v_min_with, 100);

  if p_amount < v_min_with then
    raise exception 'Minimum withdrawal amount is ₹%', v_min_with;
  end if;

  if trim(coalesce(p_upi_id, '')) = '' then
    raise exception 'Valid UPI ID is required';
  end if;

  -- Lock profile row
  select points into v_current_points from public.profiles where id = v_user_id for update;
  if v_current_points is null or v_current_points < p_amount then
    raise exception 'Insufficient balance. Available: ₹%, Requested: ₹%', coalesce(v_current_points, 0), p_amount;
  end if;

  -- Deduct points
  v_new_balance := v_current_points - p_amount;
  update public.profiles set points = v_new_balance where id = v_user_id;

  -- Create withdrawal request
  insert into public.withdrawal_requests (user_id, amount, upi_id, account_holder_name, status)
  values (v_user_id, p_amount, trim(p_upi_id), trim(p_account_holder), 'pending')
  returning id into v_req_id;

  -- Record in ledger
  insert into public.wallet_transactions (user_id, type, amount, balance_after, reference_id, description)
  values (v_user_id, 'withdrawal', -p_amount, v_new_balance, v_req_id, 'Withdrawal request submitted for UPI: ' || trim(p_upi_id));

  return v_req_id;
end;
$$;

-- 6. RPC: APPROVE DEPOSIT REQUEST (Admin only: Credits points to user)
create or replace function public.approve_deposit_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_req record;
  v_new_balance integer;
begin
  if not public.has_role(v_admin_id, 'admin') then
    raise exception 'Admin access required';
  end if;

  select * into v_req from public.deposit_requests where id = p_request_id for update;
  if not found then
    raise exception 'Deposit request not found';
  end if;

  if v_req.status <> 'pending' then
    raise exception 'Request is already %', v_req.status;
  end if;

  -- Credit points to user profile
  update public.profiles
  set points = points + v_req.amount
  where id = v_req.user_id
  returning points into v_new_balance;

  -- Update request status
  update public.deposit_requests
  set status = 'approved',
      reviewed_by = v_admin_id,
      reviewed_at = now()
  where id = p_request_id;

  -- Add to ledger
  insert into public.wallet_transactions (user_id, type, amount, balance_after, reference_id, description)
  values (v_req.user_id, 'deposit', v_req.amount, v_new_balance, p_request_id, 'Deposit approved via UTR: ' || v_req.utr_number);
end;
$$;

-- 7. RPC: REJECT DEPOSIT REQUEST (Admin only)
create or replace function public.reject_deposit_request(p_request_id uuid, p_reason text default 'Invalid UTR or payment not received')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
begin
  if not public.has_role(v_admin_id, 'admin') then
    raise exception 'Admin access required';
  end if;

  update public.deposit_requests
  set status = 'rejected',
      rejection_reason = p_reason,
      reviewed_by = v_admin_id,
      reviewed_at = now()
  where id = p_request_id and status = 'pending';

  if not found then
    raise exception 'Pending deposit request not found';
  end if;
end;
$$;

-- 8. RPC: APPROVE WITHDRAWAL REQUEST (Admin only)
create or replace function public.approve_withdrawal_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
begin
  if not public.has_role(v_admin_id, 'admin') then
    raise exception 'Admin access required';
  end if;

  update public.withdrawal_requests
  set status = 'approved',
      reviewed_by = v_admin_id,
      reviewed_at = now()
  where id = p_request_id and status = 'pending';

  if not found then
    raise exception 'Pending withdrawal request not found';
  end if;
end;
$$;

-- 9. RPC: REJECT WITHDRAWAL REQUEST (Admin only: refunds points back to user profile)
create or replace function public.reject_withdrawal_request(p_request_id uuid, p_reason text default 'Incorrect UPI or payment issue')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid := auth.uid();
  v_req record;
  v_new_balance integer;
begin
  if not public.has_role(v_admin_id, 'admin') then
    raise exception 'Admin access required';
  end if;

  select * into v_req from public.withdrawal_requests where id = p_request_id for update;
  if not found then
    raise exception 'Withdrawal request not found';
  end if;

  if v_req.status <> 'pending' then
    raise exception 'Request is already %', v_req.status;
  end if;

  -- Refund points back to user profile
  update public.profiles
  set points = points + v_req.amount
  where id = v_req.user_id
  returning points into v_new_balance;

  -- Mark rejected
  update public.withdrawal_requests
  set status = 'rejected',
      rejection_reason = p_reason,
      reviewed_by = v_admin_id,
      reviewed_at = now()
  where id = p_request_id;

  -- Record refund in ledger
  insert into public.wallet_transactions (user_id, type, amount, balance_after, reference_id, description)
  values (v_req.user_id, 'withdrawal_refund', v_req.amount, v_new_balance, p_request_id, 'Withdrawal rejected: ' || p_reason || ' (Refunded to wallet)');
end;
$$;
