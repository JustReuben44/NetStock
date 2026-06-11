import { createClient } from "@/lib/supabase-server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const body = await req.json();

  const { error } = await supabase.from("users").insert(body);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { email, ...updates } = await req.json();

  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const { error } = await supabase.from("users").update(updates).eq("email_address", email);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { email } = await req.json();

  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const { error } = await supabase.from("users").delete().eq("email_address", email);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
