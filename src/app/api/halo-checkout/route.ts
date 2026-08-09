import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { updateHaloStock } from "@/lib/halo";
import { sendSlackMessage } from "@/lib/slack";

const MAX_QUANTITY = 1000;

// Handles Equipment stock changes end-to-end: validates the request, updates
// Halo, and writes the borrow/audit rows server-side (the client cannot —
// RLS blocks direct borrow/audit inserts so the trail can't be forged).
export async function POST(request: Request) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userEmail = user.email;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { item_id, quantity, action_type, borrow_id } = (body ?? {}) as Record<string, unknown>;
  const itemId = typeof item_id === "string" || typeof item_id === "number" ? String(item_id).trim() : "";
  const borrowId = typeof borrow_id === "string" || typeof borrow_id === "number" ? String(borrow_id).trim() : "";
  let qty = Number(quantity);

  if (!itemId) {
    return NextResponse.json({ error: "item_id is required" }, { status: 400 });
  }
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QUANTITY) {
    return NextResponse.json({ error: `Quantity must be a whole number between 1 and ${MAX_QUANTITY}` }, { status: 400 });
  }
  if (action_type !== "withdraw" && action_type !== "intake") {
    return NextResponse.json({ error: "Invalid action_type" }, { status: 400 });
  }
  if (borrowId && action_type !== "intake") {
    return NextResponse.json({ error: "borrow_id is only valid for returns" }, { status: 400 });
  }

  const { data: eqRow } = await supabaseAdmin
    .from("equipment")
    .select("halo_id, low_stock_threshold, item(item_name)")
    .eq("item_id", itemId)
    .maybeSingle();

  if (!eqRow) {
    return NextResponse.json({ error: "That item is not registered as equipment" }, { status: 404 });
  }
  if (!eqRow.halo_id) {
    return NextResponse.json({ error: "No Halo ID set — link it to a Halo item first" }, { status: 400 });
  }

  // Equipment return: verify the borrow belongs to this user and is still open
  let returningBorrow: { borrow_id: string; amount_borrowed: number } | null = null;
  if (borrowId) {
    const { data: bRow } = await supabaseAdmin
      .from("borrow")
      .select("borrow_id, item_id, email_address, amount_borrowed, status")
      .eq("borrow_id", borrowId)
      .maybeSingle();

    if (!bRow || bRow.email_address?.toLowerCase() !== userEmail.toLowerCase()) {
      return NextResponse.json({ error: "Borrow record not found" }, { status: 404 });
    }
    if (!["borrowed", "reminded"].includes(bRow.status)) {
      return NextResponse.json({ error: "This borrow has already been returned" }, { status: 409 });
    }
    if (String(bRow.item_id) !== itemId) {
      return NextResponse.json({ error: "Borrow does not match this item" }, { status: 400 });
    }
    returningBorrow = bRow;
    qty = bRow.amount_borrowed;
  }

  const quantityChange = action_type === "withdraw" ? -qty : qty;

  let result;
  try {
    result = await updateHaloStock(String(eqRow.halo_id), quantityChange);
  } catch (err) {
    console.error("Halo request failed:", err);
    return NextResponse.json({ error: "Halo request failed" }, { status: 502 });
  }

  if (!result.ok) {
    if (result.reason === "insufficient_stock") {
      return NextResponse.json(
        { error: `Insufficient stock in Halo (${result.currentStock} available)` },
        { status: 409 }
      );
    }
    if (result.reason === "not_found") {
      return NextResponse.json({ error: "Item not found in Halo" }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to update Halo stock" }, { status: 502 });
  }

  const nowIso = new Date().toISOString();

  if (action_type === "withdraw") {
    const { data: settingRow } = await supabaseAdmin
      .from("setting")
      .select("reminder_interval")
      .eq("setting_id", 1)
      .maybeSingle();
    const reminderMinutes = settingRow?.reminder_interval ?? 60;

    const { error: borrowError } = await supabaseAdmin.from("borrow").insert({
      item_id: itemId,
      email_address: userEmail,
      amount_borrowed: qty,
      date_borrowed: nowIso,
      timer_expiry: new Date(Date.now() + reminderMinutes * 60 * 1000).toISOString(),
      status: "borrowed",
    });
    if (borrowError) console.error("Borrow insert error:", borrowError);
  } else if (returningBorrow) {
    const { error: returnError } = await supabaseAdmin
      .from("borrow")
      .update({ status: "returned" })
      .eq("borrow_id", returningBorrow.borrow_id);
    if (returnError) console.error("Borrow return update error:", returnError);
  }

  const { error: auditError } = await supabaseAdmin.from("audit").insert({
    item_id: itemId,
    email_address: userEmail,
    quantity: quantityChange,
    occurred_at: nowIso,
    action: action_type === "withdraw" ? "withdraw" : returningBorrow ? "return" : "intake",
  });
  if (auditError) console.error("Audit insert error:", auditError);

  if (quantityChange < 0) {
    const threshold = eqRow.low_stock_threshold;
    if (threshold != null && result.newStock <= threshold) {
      const itemName = (eqRow.item as unknown as { item_name?: string })?.item_name ?? `Halo item ${eqRow.halo_id}`;
      await sendSlackMessage(
        `:rotating_light: *Low Stock Alert*\n*Item:* ${itemName}\n*Remaining:* ${result.newStock} (threshold: ${threshold})`
      );
    }
  }

  return NextResponse.json({ ok: true, newStock: result.newStock });
}
