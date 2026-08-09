-- CRITICAL SECURITY MIGRATION: Row Level Security + server-side audit writes.
-- Run in the Supabase SQL editor AFTER 20260809_stock_and_basket_fixes.sql,
-- and deploy the matching app code at the same time (older deployed clients
-- write borrow/audit rows directly, which this migration blocks).
--
-- What this enforces:
--   * Staff can no longer edit users/roles/settings/items via the browser
--     console — admin checks now happen in the database, not just the UI.
--   * borrow and audit rows can only be created by the checkout/return
--     database functions or the server (service role), stamped with the
--     authenticated user's email — the audit trail can't be forged or skipped.

-- ---------------------------------------------------------------------------
-- 0. Helpers
-- ---------------------------------------------------------------------------
create or replace function public.current_email()
returns text
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '')
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from users
    where lower(email_address) = lower(public.current_email())
      and role = 'Administrator'
  );
$$;

revoke execute on function public.current_email() from public, anon;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.current_email() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Drop existing policies on our tables (permissive leftovers would OR with
--    the new ones and defeat them), then enable RLS everywhere.
-- ---------------------------------------------------------------------------
do $$
declare pol record;
begin
  for pol in
    select schemaname, tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and tablename in ('users','item','tool','equipment','borrow','audit',
                         'basket','basket_item','location','item_location',
                         'product_group','setting')
  loop
    execute format('drop policy %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  end loop;
end $$;

alter table users         enable row level security;
alter table item          enable row level security;
alter table tool          enable row level security;
alter table equipment     enable row level security;
alter table borrow        enable row level security;
alter table audit         enable row level security;
alter table basket        enable row level security;
alter table basket_item   enable row level security;
alter table location      enable row level security;
alter table item_location enable row level security;
alter table product_group enable row level security;
alter table setting       enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Catalogue tables: everyone signed in can read, only admins can write.
-- ---------------------------------------------------------------------------
create policy item_select       on item          for select to authenticated using (true);
create policy item_admin_ins    on item          for insert to authenticated with check (public.is_admin());
create policy item_admin_upd    on item          for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy item_admin_del    on item          for delete to authenticated using (public.is_admin());

create policy tool_select       on tool          for select to authenticated using (true);
create policy tool_admin_ins    on tool          for insert to authenticated with check (public.is_admin());
create policy tool_admin_upd    on tool          for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy tool_admin_del    on tool          for delete to authenticated using (public.is_admin());

create policy equipment_select    on equipment     for select to authenticated using (true);
create policy equipment_admin_ins on equipment     for insert to authenticated with check (public.is_admin());
create policy equipment_admin_upd on equipment     for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy equipment_admin_del on equipment     for delete to authenticated using (public.is_admin());

create policy location_select    on location      for select to authenticated using (true);
create policy location_admin_ins on location      for insert to authenticated with check (public.is_admin());
create policy location_admin_upd on location      for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy location_admin_del on location      for delete to authenticated using (public.is_admin());

create policy item_location_select    on item_location for select to authenticated using (true);
create policy item_location_admin_ins on item_location for insert to authenticated with check (public.is_admin());
create policy item_location_admin_del on item_location for delete to authenticated using (public.is_admin());

create policy product_group_select    on product_group for select to authenticated using (true);
create policy product_group_admin_ins on product_group for insert to authenticated with check (public.is_admin());
create policy product_group_admin_del on product_group for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. users: you may read your own row; admins manage everything.
-- ---------------------------------------------------------------------------
create policy users_select_self_or_admin on users for select to authenticated
  using (lower(email_address) = lower(public.current_email()) or public.is_admin());
create policy users_admin_ins on users for insert to authenticated with check (public.is_admin());
create policy users_admin_upd on users for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy users_admin_del on users for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. setting: admin only (checkout reads it via SECURITY DEFINER / server).
-- ---------------------------------------------------------------------------
create policy setting_admin_select on setting for select to authenticated using (public.is_admin());
create policy setting_admin_ins    on setting for insert to authenticated with check (public.is_admin());
create policy setting_admin_upd    on setting for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 5. basket / basket_item: owners only (admins can see everything).
-- ---------------------------------------------------------------------------
create policy basket_owner_select on basket for select to authenticated
  using (lower(email_address) = lower(public.current_email()) or public.is_admin());
create policy basket_owner_ins on basket for insert to authenticated
  with check (lower(email_address) = lower(public.current_email()));
create policy basket_owner_upd on basket for update to authenticated
  using (lower(email_address) = lower(public.current_email()) or public.is_admin())
  with check (lower(email_address) = lower(public.current_email()) or public.is_admin());
create policy basket_owner_del on basket for delete to authenticated
  using (lower(email_address) = lower(public.current_email()) or public.is_admin());

create policy basket_item_owner_all on basket_item for all to authenticated
  using (
    public.is_admin() or exists (
      select 1 from basket b
      where b.basket_id = basket_item.basket_id
        and lower(b.email_address) = lower(public.current_email())
    )
  )
  with check (
    public.is_admin() or exists (
      select 1 from basket b
      where b.basket_id = basket_item.basket_id
        and lower(b.email_address) = lower(public.current_email())
    )
  );

-- ---------------------------------------------------------------------------
-- 6. borrow: read your own (admins read all); the ONLY client-side write
--    allowed is flipping your own borrow's status to returned/left_on_site.
--    Inserts happen exclusively in checkout_tool() / the server.
-- ---------------------------------------------------------------------------
create policy borrow_select_own_or_admin on borrow for select to authenticated
  using (lower(email_address) = lower(public.current_email()) or public.is_admin());
create policy borrow_update_status on borrow for update to authenticated
  using (lower(email_address) = lower(public.current_email()) or public.is_admin())
  with check (
    public.is_admin()
    or (lower(email_address) = lower(public.current_email())
        and status in ('returned', 'left_on_site'))
  );
create policy borrow_admin_del on borrow for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 7. audit: readable by all signed-in users, written ONLY by the database
--    functions below or the server. Admins may delete (item deletion).
--    The new `action` column distinguishes withdrawals, intakes and returns
--    (previously a return was indistinguishable from a stock intake).
-- ---------------------------------------------------------------------------
alter table audit add column if not exists action text
  check (action in ('withdraw', 'intake', 'return'));

create policy audit_select    on audit for select to authenticated using (true);
create policy audit_admin_del on audit for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 8. Trusted checkout/return functions. SECURITY DEFINER: they bypass RLS but
--    stamp rows with the AUTHENTICATED email, so the trail can't be forged.
-- ---------------------------------------------------------------------------

-- Withdraw or intake a Tool: atomically adjusts stock, creates the borrow
-- (withdraw only) and writes the audit row. Returns the new quantity, or
-- NULL when the tool row is missing / stock is insufficient (nothing changes).
create or replace function public.checkout_tool(p_item_id text, p_quantity int, p_action text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email   text := public.current_email();
  v_item    tool.item_id%type;
  v_delta   int;
  v_new_qty int;
  v_minutes int;
begin
  if v_email = '' then raise exception 'Not authenticated'; end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 1000 then
    raise exception 'Quantity must be between 1 and 1000';
  end if;
  if p_action not in ('withdraw', 'intake') then
    raise exception 'Invalid action';
  end if;

  v_item  := p_item_id;
  v_delta := case when p_action = 'withdraw' then -p_quantity else p_quantity end;

  update tool
     set quantity = coalesce(quantity, 0) + v_delta
   where item_id = v_item
     and coalesce(quantity, 0) + v_delta >= 0
  returning quantity into v_new_qty;

  if v_new_qty is null then
    return null;
  end if;

  if p_action = 'withdraw' then
    select reminder_interval into v_minutes from setting where setting_id = 1;
    insert into borrow (item_id, email_address, amount_borrowed, date_borrowed, timer_expiry, status)
    values (v_item, v_email, p_quantity, now(), now() + make_interval(mins => coalesce(v_minutes, 60)), 'borrowed');
  end if;

  insert into audit (item_id, email_address, quantity, occurred_at, action)
  values (v_item, v_email, v_delta, now(), p_action);

  return v_new_qty;
end;
$$;

-- Return a borrowed Tool: restores stock, marks the borrow returned and
-- writes the audit row. Only works on your own active borrows (admins: any).
-- Returns false if the borrow doesn't exist / isn't yours / already returned.
create or replace function public.return_tool(p_borrow_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := public.current_email();
  b       borrow%rowtype;
begin
  if v_email = '' then raise exception 'Not authenticated'; end if;

  select * into b
    from borrow
   where borrow_id::text = p_borrow_id
     and (lower(email_address) = lower(v_email) or public.is_admin())
     and status in ('borrowed', 'reminded')
   for update;

  if not found then
    return false;
  end if;

  update tool
     set quantity = coalesce(quantity, 0) + b.amount_borrowed
   where item_id = b.item_id;

  update borrow set status = 'returned' where borrow_id = b.borrow_id;

  insert into audit (item_id, email_address, quantity, occurred_at, action)
  values (b.item_id, v_email, b.amount_borrowed, now(), 'return');

  return true;
end;
$$;

revoke execute on function public.checkout_tool(text, int, text) from public, anon;
revoke execute on function public.return_tool(text) from public, anon;
grant execute on function public.checkout_tool(text, int, text) to authenticated;
grant execute on function public.return_tool(text) to authenticated;

-- Superseded by checkout_tool / return_tool
drop function if exists public.adjust_tool_stock(text, int);
