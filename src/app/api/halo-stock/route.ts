import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getHaloStock } from "@/lib/halo";

// Read-only: returns the live Halo stock level for an Equipment item
export async function GET(request: Request) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get("item_id")?.trim() ?? "";
  if (!itemId) return NextResponse.json({ error: "item_id is required" }, { status: 400 });

  const { data: eqRow } = await supabaseAdmin
    .from("equipment")
    .select("halo_id")
    .eq("item_id", itemId)
    .maybeSingle();

  if (!eqRow) return NextResponse.json({ error: "That item is not registered as equipment" }, { status: 404 });
  if (!eqRow.halo_id) return NextResponse.json({ error: "No Halo ID linked" }, { status: 400 });

  try {
    const result = await getHaloStock(String(eqRow.halo_id));
    if (!result.ok) {
      return NextResponse.json(
        { error: result.reason === "not_found" ? "Item not found in Halo" : "Halo request failed" },
        { status: 502 }
      );
    }
    return NextResponse.json({ stock: result.stock });
  } catch (err) {
    console.error("Halo stock fetch failed:", err);
    return NextResponse.json({ error: "Halo request failed" }, { status: 502 });
  }
}
