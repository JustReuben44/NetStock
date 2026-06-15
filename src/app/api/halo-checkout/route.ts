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

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  console.log("[halo-checkout] user:", user?.email, "authError:", authError);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  console.log("[halo-checkout] body:", body);
  const { halo_id, quantity, action_type } = body;

  if (!halo_id) return NextResponse.json({ error: "No halo_id" }, { status: 400 });

  const quantityChange = action_type === "withdraw" ? -quantity : quantity;
  console.log("[halo-checkout] quantityChange:", quantityChange, "halo_id:", halo_id);

  const success = await updateHaloStock(halo_id, quantityChange);
  console.log("[halo-checkout] success:", success);
  if (!success) return NextResponse.json({ error: "Failed to update Halo stock" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
