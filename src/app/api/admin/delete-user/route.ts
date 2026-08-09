import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: caller } = await supabaseAdmin
    .from("users")
    .select("role")
    .ilike("email_address", user.email)
    .maybeSingle();

  if (caller?.role !== "Administrator") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = typeof (body as Record<string, unknown>)?.email === "string"
    ? ((body as Record<string, unknown>).email as string).trim()
    : "";

  if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });
  if (email.toLowerCase() === user.email.toLowerCase()) {
    return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
  }

  const { error: deleteError } = await supabaseAdmin
    .from("users")
    .delete()
    .ilike("email_address", email);

  if (deleteError) {
    console.error("User delete failed:", deleteError);
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }

  // Also remove the Supabase auth account so any existing session is revoked
  // immediately (previously deleted users kept a valid session until expiry)
  const { data: list, error: listError } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) {
    console.error("Auth user lookup failed:", listError);
  } else {
    const authUser = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (authUser) {
      const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(authUser.id);
      if (authDeleteError) console.error("Auth user delete failed:", authDeleteError);
    }
  }

  return NextResponse.json({ ok: true });
}
