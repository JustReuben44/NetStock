import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Called by Vercel Cron — secured by CRON_SECRET env var
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();

  // Fetch all borrowed items where timer_expiry has passed and reminder not yet sent
  const { data: overdue, error } = await supabaseAdmin
    .from("borrow")
    .select("borrow_id, item_id, email_address, amount_borrowed, timer_expiry, item(item_name)")
    .eq("status", "borrowed")
    .lte("timer_expiry", now);

  if (error) {
    console.error("Reminder fetch error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!overdue || overdue.length === 0) {
    return NextResponse.json({ sent: 0 });
  }

  const results: { email: string; item: string; success: boolean }[] = [];

  for (const borrow of overdue) {
    const itemName = (borrow.item as any)?.item_name ?? borrow.item_id;
    const success = await sendReminderNotification(borrow.email_address, itemName, borrow.amount_borrowed, borrow.timer_expiry);

    if (success) {
      await supabaseAdmin
        .from("borrow")
        .update({ status: "reminded" })
        .eq("borrow_id", borrow.borrow_id);
    }

    results.push({ email: borrow.email_address, item: itemName, success });
  }

  return NextResponse.json({ sent: results.filter((r) => r.success).length, results });
}

async function sendReminderNotification(email: string, itemName: string, quantity: number, expiry: string): Promise<boolean> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) { console.error("SLACK_WEBHOOK_URL not set"); return false; }

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `:warning: *Overdue Item Reminder*\n*User:* ${email}\n*Item:* ${itemName} (qty: ${quantity})\n*Was due:* ${new Date(expiry).toLocaleString("en-GB")}`,
    }),
  });

  if (!res.ok) console.error("Slack webhook error:", await res.text());
  return res.ok;
}
