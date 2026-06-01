"use client";
import { createClient } from "@/lib/supabase-client";
import { useEffect, useState } from "react";
import "./page.css";

const supabase = createClient();

export default function SearchItems() {
  const [searchTerm, setSearchTerm] = useState({ input: "" });
  const [items, setItems] = useState<any[]>([]);
  const [basketItemIds, setBasketItemIds] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      const { data: itemData } = await supabase.from("item").select("*");
      if (itemData) setItems(itemData);

      if (user) {
        setUserId(user.id);
        const { data: basketData } = await supabase.from("basket").select("item_id").eq("user_id", user.id);
        if (basketData) setBasketItemIds(new Set(basketData.map((r) => r.item_id)));
      }
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

  const toggleBasket = async (itemId: string) => {
    if (!userId) return;
    if (basketItemIds.has(itemId)) {
      await supabase.from("basket").delete().eq("user_id", userId).eq("item_id", itemId);
      setBasketItemIds((prev) => { const next = new Set(prev); next.delete(itemId); return next; });
    } else {
      await supabase.from("basket").insert({ user_id: userId, item_id: itemId });
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
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <h4 style={{ margin: "0 0 0.5rem 0" }}>{item.itemname}</h4>
              <div style={{ display: "flex", gap: "1rem" }}>
                <a href={`/${item.item_id}`} target="_blank" rel="noopener noreferrer">
                  <button className="itemButton">View</button>
                </a>
                <button
                  className={basketItemIds.has(item.item_id) ? "itemButton itemButton--added" : "itemButton"}
                  onClick={() => toggleBasket(item.item_id)}
                >
                  {basketItemIds.has(item.itemid) ? "Remove" : "Add"}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
