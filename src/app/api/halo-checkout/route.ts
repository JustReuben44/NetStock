import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { updateHaloStock } from "@/lib/halo";
import { sendSlackMessage } from "@/lib/slack";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { halo_id, quantity, action_type } = await request.json();

  if (!halo_id) return NextResponse.json({ error: "No halo_id" }, { status: 400 });

  const quantityChange = action_type === "withdraw" ? -quantity : quantity;

  const newStock = await updateHaloStock(halo_id, quantityChange);
  if (newStock === null) return NextResponse.json({ error: "Failed to update Halo stock" }, { status: 500 });

  // Low stock alert — only relevant when stock has decreased
  if (quantityChange < 0) {
    const { data: eqRow } = await supabase
      .from("equipment")
      .select("low_stock_threshold, item(item_name)")
      .eq("halo_id", halo_id)
      .single();

    const threshold = eqRow?.low_stock_threshold;
    if (threshold != null && newStock <= threshold) {
      const itemName = (eqRow?.item as any)?.item_name ?? `Halo item ${halo_id}`;
      await sendSlackMessage(
        `:rotating_light: *Low Stock Alert*\n*Item:* ${itemName}\n*Remaining:* ${newStock} (threshold: ${threshold})`
      );
    }
  }

  return NextResponse.json({ ok: true });
}
