"use client";
import { createClient } from "@/lib/supabase-client";
import { useEffect, useState } from "react";
import "../page.css";

const supabase = createClient();

export default function Basket() {
  const [basketItems, setBasketItems] = useState<any[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBasket = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data } = await supabase
        .from("basket")
        .select("id, item_id, item(itemname, itemtype, locationid)")
        .eq("user_id", user.id)
        .order("added_at", { ascending: false });

      if (data) setBasketItems(data);
      setLoading(false);
    };
    fetchBasket();
  }, []);

  const removeItem = async (basketId: string) => {
    await supabase.from("basket").delete().eq("id", basketId);
    setBasketItems((prev) => prev.filter((b) => b.id !== basketId));
  };

  if (loading) return (
    <main style={{ maxWidth: "1000px", margin: "0 auto", padding: "1rem", fontFamily: "Arial" }}>
      <h2 style={{ textAlign: "center" }}><em>Basket</em></h2>
      <p style={{ textAlign: "center" }}>Loading...</p>
    </main>
  );

  return (
    <main style={{ maxWidth: "1000px", margin: "0 auto", padding: "1rem", fontFamily: "Arial" }}>
      <h2 style={{ textAlign: "center" }}><em>Basket</em></h2>

      {basketItems.length === 0 ? (
        <p style={{ textAlign: "center", fontStyle: "italic", marginTop: "2rem" }}>Your basket is empty.</p>
      ) : (
        <>
          <p style={{ textAlign: "center", fontStyle: "italic" }}>{basketItems.length} item{basketItems.length !== 1 ? "s" : ""} in your basket</p>
          <ul style={{ listStyle: "none", padding: "1rem" }}>
            {basketItems.map((row) => (
              <li key={row.id} style={{ borderBottom: "1px solid #ccc", padding: "1rem 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h4 style={{ margin: "0 0 0.25rem 0" }}>{row.item?.itemname}</h4>
                    <p style={{ margin: 0, fontSize: "0.85rem", color: "#aaa" }}>
                      {row.item?.itemtype} &mdash; {row.item?.locationid}
                    </p>
                  </div>
                  <button className="itemButton" onClick={() => removeItem(row.id)}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
