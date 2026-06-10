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
  const [boxFilter, setBoxFilter] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [items, setItems] = useState<any[]>([]);
  const [basketItemIds, setBasketItemIds] = useState<Set<string>>(new Set());
  const [basketId, setBasketId] = useState<string | null>(null);
  const [errorItemId, setErrorItemId] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;

      const [{ data: itemData }, bid] = await Promise.all([
        supabase.from("item").select("*").order('item_name'),
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

  const fetchItems = async (search: string, box: string, order: "asc" | "desc") => {
    let query = supabase.from("item").select("*");

    if (search) {
      query = query.or(`item_name.ilike.%${search}%,item_type.ilike.%${search}%,product_group.ilike.%${search}%`);
    }

    if (box) {
      const { data: locationData } = await supabase
        .from("item_location")
        .select("item_id")
        .eq("location_id", box);

      const itemIds = locationData?.map((r: any) => r.item_id) ?? [];
      if (itemIds.length === 0) { setItems([]); return; }
      query = query.in("item_id", itemIds);
    }

    query = query.order("item_name", { ascending: order === "asc" });

    const { data, error } = await query;
    if (!error && data) setItems(data);
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    fetchItems(searchTerm.input, boxFilter, sortOrder);
  };

  const toggleSort = () => {
    const next = sortOrder === "asc" ? "desc" : "asc";
    setSortOrder(next);
    fetchItems(searchTerm.input, boxFilter, next);
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
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem", marginBottom: "2rem" }}>
          <input
            type="text"
            placeholder="e.g fibre cables"
            style={{ padding: "0.5rem", fontSize: "1rem", width: "300px", borderRadius: "4px", border: "1px solid #ccc" }}
            value={searchTerm.input}
            onChange={(e) => setSearchTerm({ ...searchTerm, input: e.target.value })}
          />
        </form>
      </div>

      <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "0 1rem", display: "flex", alignItems: "center", fontFamily: "Arial" }}>
        <div style={{ flex: 1, display: "flex", justifyContent: "flex-start" }}>
          <button type="button" className="itemButton" onClick={toggleSort}>
            {sortOrder === "asc" ? "A → Z" : "Z → A"}
          </button>
        </div>
        <p style={{ fontStyle: "italic", margin: 0 }}>Showing {items.length} results</p>
        <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
          <input
            type="text"
            placeholder="search by box"
            style={{ padding: "0.5rem", fontSize: "1rem", width: "120px", borderRadius: "4px", border: "1px solid #ccc" }}
            value={boxFilter}
            onChange={(e) => setBoxFilter(e.target.value)}
          />
        </div>
      </div>

      <ul style={{ maxWidth: "1000px", margin: "0 auto", padding: "1rem", fontFamily: "Arial", listStyle: "none" }}>
        {items.map((item, key) => (
          <li key={key} style={{ borderBottom: "1px solid #ccc", padding: "1rem 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <h4 style={{ margin: "0 0 0.5rem 0" }}>{item.item_name}</h4>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.25rem" }}>
                <div style={{ display: "flex", gap: "1rem" }}>
                  {item.item_type !== "Miscellaneous" && (
                  <button
                    className={basketItemIds.has(item.item_id) ? "itemButton itemButton--added" : "itemButton"}
                    onClick={() => addToBasket(item.item_id)}
                  >
                    {basketItemIds.has(item.item_id) ? "Added" : "Add"}
                  </button>
                  )}
                  <a href={`/${item.item_id}`}>
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
