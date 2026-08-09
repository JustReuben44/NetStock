-- Run this in the Supabase SQL editor BEFORE deploying the matching app code.

-- 1. Atomic tool stock adjustment.
-- Fixes the read-then-write race where two simultaneous checkouts could
-- oversell stock or overwrite each other's update.
-- Returns the new quantity, or NULL when the tool row is missing or the
-- withdrawal would take stock below zero (in which case nothing is changed).
create or replace function public.adjust_tool_stock(p_item_id text, p_delta int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  new_qty int;
begin
  update tool
     set quantity = coalesce(quantity, 0) + p_delta
   where item_id::text = p_item_id
     and coalesce(quantity, 0) + p_delta >= 0
  returning quantity into new_qty;

  return new_qty;
end;
$$;

grant execute on function public.adjust_tool_stock(text, int) to authenticated;
revoke execute on function public.adjust_tool_stock(text, int) from anon;

-- 2. Prevent duplicate active baskets per user (race between two tabs both
-- creating a basket at the same time).
-- If this index fails to create, you already have duplicates — find them with:
--   select email_address, count(*) from basket where status = 'active'
--   group by email_address having count(*) > 1;
-- then delete/merge the extras and re-run.
create unique index if not exists basket_one_active_per_user
  on basket (email_address)
  where status = 'active';
