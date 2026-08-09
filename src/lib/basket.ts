import type { SupabaseClient } from "@supabase/supabase-js";

export async function getOrCreateBasket(supabase: SupabaseClient, email: string): Promise<string | null> {
  const { data: existing } = await supabase
    .from("basket")
    .select("basket_id")
    .eq("email_address", email)
    .eq("status", "active")
    .order("basket_id")
    .limit(1)
    .maybeSingle();

  if (existing) return existing.basket_id;

  const { data: created, error } = await supabase
    .from("basket")
    .insert({ email_address: email })
    .select("basket_id")
    .single();

  if (!error && created) return created.basket_id;

  // Unique-violation race: another tab created the basket first — fetch the winner
  const { data: raced } = await supabase
    .from("basket")
    .select("basket_id")
    .eq("email_address", email)
    .eq("status", "active")
    .order("basket_id")
    .limit(1)
    .maybeSingle();

  return raced?.basket_id ?? null;
}
