"use client";
import { createClient } from "@/lib/supabase-client";
import { useToast } from "@/components/toast";
import { useEffect, useState } from "react";
import "../page.css";

const supabase = createClient();

export default function BorrowedItems() {
  const showToast = useToast();
  const [borrows, setBorrows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [returning, setReturning] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) { setLoading(false); return; }

      const { data: userData } = await supabase
        .from("users")
        .select("role")
        .eq("email_address", user.email)
        .maybeSingle();

      const admin = userData?.role === "Administrator";
      setIsAdmin(admin);

      const { data, error } = await supabase
        .from("borrow")
        .select("borrow_id, item_id, email_address, amount_borrowed, date_borrowed, timer_expiry, status, item(item_name, item_type)")
        .eq("email_address", user.email)
        .neq("status", "returned")
        .neq("status", "left_on_site")
        .order("date_borrowed", { ascending: false });
      if (error) console.error("Borrow fetch error:", error);
      setBorrows(data ?? []);
      setLoading(false);
    };
    init();
  }, []);

  const handleReturn = async (borrowId: string, itemId: string, amountBorrowed: number, itemType?: string) => {
    setReturning(borrowId);

    if (itemType === "Equipment") {
      // The server route puts stock back into Halo, marks the borrow
      // returned, and writes the audit row
      const res = await fetch("/api/halo-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: itemId, quantity: amountBorrowed, action_type: "intake", borrow_id: borrowId }),
      });
      if (!res.ok) {
        let message = "Return failed — Halo could not be updated";
        try {
          const errJson = await res.json();
          if (errJson?.error) message = errJson.error;
        } catch { /* keep generic message */ }
        showToast("error", message);
        setReturning(null);
        return;
      }
    } else {
      // Single atomic database call: restores stock, marks the borrow
      // returned, and writes the audit row server-side
      const { data: returned, error: returnError } = await supabase
        .rpc("return_tool", { p_borrow_id: borrowId });

      if (returnError || !returned) {
        showToast("error", returnError?.message ?? "Return failed — please refresh and try again");
        setReturning(null);
        return;
      }
    }

    showToast("success", "Item returned");
    setBorrows((prev) => prev.filter((b) => b.borrow_id !== borrowId));
    setReturning(null);
  };

  const handleConfirmWithdrawal = async (borrowId: string) => {
    setReturning(borrowId);
    const { error } = await supabase
      .from("borrow")
      .update({ status: "left_on_site" })
      .eq("borrow_id", borrowId);
    if (error) { showToast("error", "Confirm withdrawal failed: " + error.message); setReturning(null); return; }
    showToast("success", "Withdrawal confirmed");
    setBorrows((prev) => prev.filter((b) => b.borrow_id !== borrowId));
    setReturning(null);
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  };

  if (loading) return (
    <main style={{ maxWidth: "1000px", margin: "0 auto", padding: "1rem", fontFamily: "Arial" }}>
      <h2 style={{ textAlign: "center" }}><em>Borrowed Items</em></h2>
      <p style={{ textAlign: "center" }}>Loading...</p>
    </main>
  );

  return (
    <main style={{ maxWidth: "1000px", margin: "0 auto", padding: "1rem", fontFamily: "Arial" }}>
      <h2 style={{ textAlign: "center" }}><em>Borrowed Items</em></h2>

      {borrows.length === 0 ? (
        <p style={{ textAlign: "center", fontStyle: "italic", marginTop: "2rem" }}>No active borrows.</p>
      ) : (
        <>
          <p style={{ textAlign: "center", fontStyle: "italic" }}>
            {borrows.length} active borrow{borrows.length !== 1 ? "s" : ""}
          </p>
          <ul style={{ listStyle: "none", padding: "1rem" }}>
            {borrows.map((row) => {
              const isOverdue = row.timer_expiry && new Date(row.timer_expiry) < new Date();
              return (
                <li key={row.borrow_id} style={{ borderBottom: "1px solid #ccc", padding: "1rem 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <h4 style={{ margin: "0 0 0.25rem 0" }}>{row.item?.item_name ?? row.item_id}</h4>
                      {isAdmin && (
                        <p style={{ margin: "0 0 0.2rem", fontSize: "0.85rem", color: "#aaa" }}>{row.email_address}</p>
                      )}
                      <p style={{ margin: "0 0 0.2rem", fontSize: "0.85rem" }}>
                        Qty: <strong>{row.amount_borrowed}</strong>
                        &nbsp;&nbsp;·&nbsp;&nbsp;Borrowed: {formatDate(row.date_borrowed)}
                        {row.timer_expiry && (
                          <>&nbsp;&nbsp;·&nbsp;&nbsp;Due: <span style={{ color: isOverdue ? "#f44336" : "inherit" }}>{formatDate(row.timer_expiry)}</span></>
                        )}
                      </p>
                      {isOverdue && (
                        <p style={{ margin: 0, fontSize: "0.8rem", color: "#f44336" }}>Overdue</p>
                      )}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", alignItems: "flex-end" }}>
                      <button
                        className="itemButton"
                        onClick={() => handleReturn(row.borrow_id, row.item_id, row.amount_borrowed, row.item?.item_type)}
                        disabled={returning === row.borrow_id}
                      >
                        {returning === row.borrow_id ? "Returning..." : "Return"}
                      </button>
                      {row.item?.item_type === "Equipment" && (
                        <button
                          className="itemButton"
                          onClick={() => handleConfirmWithdrawal(row.borrow_id)}
                          disabled={returning === row.borrow_id}
                        >
                          Confirm Withdrawal
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </main>
  );
}
