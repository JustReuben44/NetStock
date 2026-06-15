"use client";
import { createClient } from "@/lib/supabase-client";
import { useEffect, useState } from "react";
import "../page.css";

const supabase = createClient();

export default function Basket() {
  const [basketItems, setBasketItems] = useState<any[]>([]);
  const [basketId, setBasketId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutMessage, setCheckoutMessage] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);

  useEffect(() => {
    const fetchBasket = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) { setLoading(false); return; }

      const { data: basketRow, error: basketError } = await supabase
        .from("basket")
        .select("basket_id")
        .eq("email_address", user.email)
        .eq("status", "active")
        .single();

      if (basketError || !basketRow) { setLoading(false); return; }

      setBasketId(basketRow.basket_id);

      const { data: itemRows, error: itemError } = await supabase
        .from("basket_item")
        .select("item_id, quantity, action_type, item(item_id, item_name, item_type, item_location(location_id))")
        .eq("basket_id", basketRow.basket_id);

      if (itemError) { console.error("Basket item error:", itemError); setLoading(false); return; }

      setBasketItems(itemRows ?? []);
      setLoading(false);
    };
    fetchBasket();
  }, []);

  const removeItem = async (itemId: string) => {
    if (!basketId) return;
    await supabase
      .from("basket_item")
      .delete()
      .eq("basket_id", basketId)
      .eq("item_id", itemId);
    setBasketItems((prev) => prev.filter((b) => b.item_id !== itemId));
  };

  const updateQuantity = async (itemId: string, newQty: number) => {
    if (!basketId || newQty < 1) return;
    const { error } = await supabase
      .from("basket_item")
      .update({ quantity: newQty })
      .eq("basket_id", basketId)
      .eq("item_id", itemId);
    if (!error) {
      setBasketItems((prev) =>
        prev.map((b) => b.item_id === itemId ? { ...b, quantity: newQty } : b)
      );
    }
  };

  const updateActionType = async (itemId: string, newType: string) => {
    if (!basketId) return;
    const { error } = await supabase
      .from("basket_item")
      .update({ action_type: newType })
      .eq("basket_id", basketId)
      .eq("item_id", itemId);
    if (!error) {
      setBasketItems((prev) =>
        prev.map((b) => b.item_id === itemId ? { ...b, action_type: newType } : b)
      );
    }
  };

  const handleCheckout = async () => {
    if (!basketId || basketItems.length === 0) return;
    setCheckingOut(true);
    setCheckoutMessage(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) { setCheckingOut(false); return; }

    const { data: settingsRow } = await supabase
      .from("setting")
      .select("reminder_interval")
      .eq("setting_id", 1)
      .single();
    const reminderMinutes = settingsRow?.reminder_interval ?? 60;

    const errors: string[] = [];
    const skipped: string[] = [];
    const processedIds: string[] = [];
    const now = new Date();
    const expiry = new Date(now.getTime() + reminderMinutes * 60 * 1000);

    for (const row of basketItems) {
      const itemType = row.item?.item_type;
      const itemName = row.item?.item_name ?? row.item_id;

      if (itemType === "Equipment") {
        const { data: eqRow } = await supabase
          .from("equipment")
          .select("halo_id")
          .eq("item_id", row.item_id)
          .single();

        if (!eqRow?.halo_id) {
          errors.push(`${itemName}: no Halo ID set — link it to a Halo item first`);
          continue;
        }

        const res = await fetch("/api/halo-checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ halo_id: eqRow.halo_id, quantity: row.quantity, action_type: row.action_type }),
        });

        if (res.ok) {
          if (row.action_type === "withdraw") {
            const { error: borrowError } = await supabase.from("borrow").insert({
              item_id: row.item_id,
              email_address: user.email,
              amount_borrowed: row.quantity,
              date_borrowed: now.toISOString(),
              timer_expiry: expiry.toISOString(),
              status: "borrowed",
            });
            if (borrowError) console.error("Equipment borrow insert error:", borrowError);
          }
          await supabase.from("audit").insert({
            item_id: row.item_id,
            email_address: user.email,
            quantity: row.action_type === "withdraw" ? -row.quantity : row.quantity,
            occurred_at: now.toISOString(),
          });
          processedIds.push(row.item_id);
        } else {
          errors.push(`${itemName}: Halo sync failed`);
        }
        continue;
      }

      if (itemType === "Tool") {
        const { data: toolRow, error: toolFetchError } = await supabase
          .from("tool")
          .select("quantity")
          .eq("item_id", row.item_id)
          .single();

        if (toolFetchError || !toolRow) {
          errors.push(`${itemName}: could not fetch stock level`);
          continue;
        }

        if (row.action_type === "withdraw") {
          if (toolRow.quantity < row.quantity) {
            errors.push(`${itemName}: insufficient stock (${toolRow.quantity} available, ${row.quantity} requested)`);
            continue;
          }
          const { error: updateError } = await supabase
            .from("tool")
            .update({ quantity: toolRow.quantity - row.quantity })
            .eq("item_id", row.item_id);
          if (updateError) { errors.push(`${itemName}: failed to update stock`); continue; }

          const { error: borrowError } = await supabase.from("borrow").insert({
            item_id: row.item_id,
            email_address: user.email,
            amount_borrowed: row.quantity,
            date_borrowed: now.toISOString(),
            timer_expiry: expiry.toISOString(),
            status: "borrowed",
          });
          if (borrowError) console.error("Borrow insert error:", borrowError);
        } else {
          const { error: updateError } = await supabase
            .from("tool")
            .update({ quantity: toolRow.quantity + row.quantity })
            .eq("item_id", row.item_id);
          if (updateError) { errors.push(`${itemName}: failed to update stock`); continue; }
        }

        const { error: auditError } = await supabase.from("audit").insert({
          item_id: row.item_id,
          email_address: user.email,
          quantity: row.action_type === "withdraw" ? -row.quantity : row.quantity,
          occurred_at: now.toISOString(),
        });
        if (auditError) console.error("Audit insert error:", auditError);

        processedIds.push(row.item_id);
      }
    }

    for (const id of processedIds) {
      await supabase.from("basket_item").delete().eq("basket_id", basketId).eq("item_id", id);
    }
    setBasketItems((prev) => prev.filter((b) => !processedIds.includes(b.item_id)));

    const parts: string[] = [];
    if (processedIds.length > 0) parts.push(`${processedIds.length} item(s) checked out successfully.`);
    if (skipped.length > 0) parts.push(`Skipped (Equipment not yet supported): ${skipped.join(", ")}.`);
    if (errors.length > 0) parts.push(`Errors: ${errors.join("; ")}.`);

    setCheckoutMessage({
      type: errors.length > 0 ? "error" : skipped.length > 0 ? "info" : "success",
      text: parts.join(" "),
    });
    setCheckingOut(false);
  };

  if (loading) return (
    <main style={{ maxWidth: "1000px", margin: "0 auto", padding: "1rem", fontFamily: "Arial" }}>
      <h2 style={{ textAlign: "center" }}><em>Basket</em></h2>
      <p style={{ textAlign: "center" }}>Loading...</p>
    </main>
  );

  return (
    <main style={{ maxWidth: "1000px", margin: "0 auto", padding: "1rem 1rem 6rem", fontFamily: "Arial" }}>
      <h2 style={{ textAlign: "center" }}><em>Basket</em></h2>

      {basketItems.length === 0 ? (
        <p style={{ textAlign: "center", fontStyle: "italic", marginTop: "2rem" }}>Your basket is empty.</p>
      ) : (
        <>
          <p style={{ textAlign: "center", fontStyle: "italic" }}>
            {basketItems.length} item{basketItems.length !== 1 ? "s" : ""} in your basket
          </p>
          <ul style={{ listStyle: "none", padding: "1rem" }}>
            {basketItems.map((row) => (
              <li key={row.item_id} style={{ borderBottom: "1px solid #ccc", padding: "1rem 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h4 style={{ margin: "0 0 0.25rem 0" }}>{row.item?.item_name}</h4>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.5rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <button
                          className="itemButton"
                          style={{ padding: "0.15rem 0.5rem", minWidth: "unset" }}
                          onClick={() => updateQuantity(row.item_id, row.quantity - 1)}
                          disabled={row.quantity <= 1}
                        >−</button>
                        <span style={{ minWidth: "1.5rem", textAlign: "center" }}>{row.quantity}</span>
                        <button
                          className="itemButton"
                          style={{ padding: "0.15rem 0.5rem", minWidth: "unset" }}
                          onClick={() => updateQuantity(row.item_id, row.quantity + 1)}
                        >+</button>
                      </div>
                      <select
                        value={row.action_type}
                        onChange={(e) => updateActionType(row.item_id, e.target.value)}
                        style={{ fontSize: "0.85rem", padding: "0.2rem 0.4rem", borderRadius: "4px", border: "1px solid #ccc", background: "#1a1a1a", color: "white", cursor: "pointer" }}
                      >
                        <option value="withdraw">Withdraw</option>
                        <option value="intake">Intake</option>
                      </select>
                    </div>
                  </div>
                  <button className="itemButton" onClick={() => removeItem(row.item_id)}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      <div style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        padding: "1rem",
        borderTop: "1px solid #333",
        background: "#111",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}>
        {checkoutMessage && (
          <p style={{
            textAlign: "center",
            marginBottom: "0.5rem",
            color: checkoutMessage.type === "success" ? "#4caf50" : checkoutMessage.type === "error" ? "#f44336" : "#ff9800",
            fontSize: "0.9rem",
            maxWidth: "400px",
          }}>
            {checkoutMessage.text}
          </p>
        )}
        <button
          className="itemButton"
          style={{ width: "100%", maxWidth: "400px", padding: "0.75rem" }}
          onClick={handleCheckout}
          disabled={checkingOut || basketItems.length === 0}
        >
          {checkingOut ? "Processing..." : "Checkout"}
        </button>
      </div>
    </main>
  );
}
