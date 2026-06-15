import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { updateHaloStock } from "@/lib/halo";

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

  if (!halo_id) return NextResponse.json({ error: "No halo_id — item not linked to Halo" }, { status: 400 });

  // Withdraw = decrement, intake = increment
  const quantityChange = action_type === "withdraw" ? -quantity : quantity;

  const success = await updateHaloStock(halo_id, quantityChange);
  if (!success) return NextResponse.json({ error: "Failed to update Halo stock" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
