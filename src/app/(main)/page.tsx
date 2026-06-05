"use client";
import { createClient } from "@/lib/supabase-client";
import { useEffect, useState } from "react";
import "./page.css";

const supabase = createClient();

async function getOrCreateBasket(email: string): Promise<string | null> {
  const { data: existing, error: fetchError } = await supabase
    .from("basket")
    .select("basket_id")
    .eq("email_address", email)
    .eq("status", "active")
    .maybeSingle();

  if (existing) return existing.basket_id;
  if (fetchError) console.log("[basket] fetch error:", fetchError.message);

  const { data: created, error: createError } = await supabase
    .from("basket")
    .insert({ email_address: email })
    .select("basket_id")
    .single();

  if (createError) console.log("[basket] create error:", createError.message);
  return created?.basket_id ?? null;
}

export default function SearchItems() {
  const [searchTerm, setSearchTerm] = useState({ input: "" });
  const [items, setItems] = useState<any[]>([]);
  const [basketItemIds, setBasketItemIds] = useState<Set<string>>(new Set());
  const [basketId, setBasketId] = useState<string | null>(null);
  const [errorItemId, setErrorItemId] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;

      const [{ data: itemData }, bid] = await Promise.all([
        supabase.from("item").select("*"),
        getOrCreateBasket(user.email),
      ]);

      if (itemData) setItems(itemData);
      console.log("[basket] basketId from getOrCreate:", bid);
      if (!bid) return;

      setBasketId(bid);

      const { data: basketData } = await supabase
        .from("basket_item")
        .select("item_id")
        .eq("basket_id", bid);

      if (basketData) setBasketItemIds(new Set(basketData.map((r) => r.item_id)));
    };
    init();
  }, []);

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    const { data, error } = await supabase
      .from("item")
      .select("*")
      .or(`itemname.ilike.%${searchTerm.input}%,itemtype.ilike.%${searchTerm.input}%,locationid.ilike.%${searchTerm.input}%`);
    if (!error && data) setItems(data);
  };

  const addToBasket = async (itemId: string) => {
    console.log("[basket] addToBasket called, basketId:", basketId, "itemId:", itemId);
    if (!basketId) { console.log("[basket] no basketId, aborting"); return; }

    if (basketItemIds.has(itemId)) {
      setErrorItemId(itemId);
      setTimeout(() => setErrorItemId(null), 3000);
      return;
    }

    const { error } = await supabase
      .from("basket_item")
      .insert({ basket_id: basketId, item_id: itemId, quantity: 1 });

    console.log("[basket] insert result error:", error?.message ?? "none");
    if (!error) {
      setBasketItemIds((prev) => new Set(prev).add(itemId));
    }
  };

  return (
    <main>
      <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "1rem", fontFamily: "Arial" }}>
        <h2 style={{ textAlign: "center" }}><em>Search Stock</em></h2>
        <form onSubmit={handleSubmit} style={{ display: "flex", justifyContent: "center", marginBottom: "2rem" }}>
          <input
            type="text"
            placeholder="e.g fibre cables"
            style={{ padding: "0.5rem", fontSize: "1rem", width: "300px", borderRadius: "4px", border: "1px solid #ccc" }}
            value={searchTerm.input}
            onChange={(e) => setSearchTerm({ ...searchTerm, input: e.target.value })}
          />
        </form>
      </div>

      <div style={{ display: "flex", justifyContent: "center" }}>
        <p style={{ textAlign: "center", fontStyle: "italic", fontFamily: "Arial" }}>Showing {items.length} results</p>
      </div>

      <ul style={{ maxWidth: "1000px", margin: "0 auto", padding: "1rem", fontFamily: "Arial", listStyle: "none" }}>
        {items.map((item, key) => (
          <li key={key} style={{ borderBottom: "1px solid #ccc", padding: "1rem 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <h4 style={{ margin: "0 0 0.5rem 0" }}>{item.itemname}</h4>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.25rem" }}>
                <div style={{ display: "flex", gap: "1rem" }}>
                  {item.itemtype !== "Misc" && (
                  <button
                    className={basketItemIds.has(item.item_id) ? "itemButton itemButton--added" : "itemButton"}
                    onClick={() => addToBasket(item.item_id)}
                  >
                    {basketItemIds.has(item.item_id) ? "Added" : "Add"}
                  </button>
                  )}
                  <a href={`/${item.item_id}`} target="_blank" rel="noopener noreferrer">
                    <button className="itemButton">View</button>
                  </a>
                </div>
                {errorItemId === item.item_id && (
                  <p style={{ margin: 0, fontSize: "0.8rem", color: "#c0392b" }}>Already in basket</p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
