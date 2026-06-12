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

type ItemType = "Tool" | "Equipment" | "Miscellaneous";

const defaultNewItem = {
  item_name: "",
  item_type: "Tool" as ItemType,
  product_group: "",
  description: "",
  rack: "",
  shelf: "",
  box: "",
  box_type: "",
  low_stock_threshold: "",
  halo_id: "",
  quantity: "",
};

export default function SearchItems() {
  const [searchTerm, setSearchTerm] = useState({ input: "" });
  const [boxFilter, setBoxFilter] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [items, setItems] = useState<any[]>([]);
  const [basketItemIds, setBasketItemIds] = useState<Set<string>>(new Set());
  const [basketId, setBasketId] = useState<string | null>(null);
  const [errorItemId, setErrorItemId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newItem, setNewItem] = useState(defaultNewItem);
  const [createError, setCreateError] = useState<string | null>(null);
  const [productGroups, setProductGroups] = useState<string[]>([]);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;

      const [{ data: itemData }, bid, { data: userData }, { data: pgData }] = await Promise.all([
        supabase.from("item").select("*").order('item_name'),
        getOrCreateBasket(user.email),
        supabase.from("users").select("role").eq("email_address", user.email).maybeSingle(),
        supabase.from("product_group").select("*").order("product_group"),
      ]);

      if (itemData) setItems(itemData);
      if (userData?.role === "Administrator") setIsAdmin(true);
      console.log("[product_group] data:", pgData);
      if (pgData) setProductGroups(pgData.map((r: any) => r.product_group));

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

    if (!error) {
      setBasketItemIds((prev) => new Set(prev).add(itemId));
    }
  };

  const createItem = async () => {
    setCreateError(null);

    if (!newItem.item_name.trim() || !newItem.rack.trim() || !newItem.shelf.trim()) {
      setCreateError("Item name, rack, and shelf are required.");
      return;
    }

    const { data: existing } = await supabase
      .from("item")
      .select("item_id")
      .eq("item_name", newItem.item_name.trim())
      .maybeSingle();

    if (existing) {
      setCreateError("An item with that name already exists.");
      return;
    }

    const { data: itemData, error: itemError } = await supabase
      .from("item")
      .insert({
        item_name: newItem.item_name.trim(),
        item_type: newItem.item_type,
        product_group: newItem.product_group.trim() || null,
        description: newItem.description.trim() || null,
      })
      .select("item_id")
      .single();

    if (itemError || !itemData) {
      setCreateError(itemError?.message ?? "Failed to create item.");
      return;
    }

    const item_id = itemData.item_id;

    if (newItem.item_type === "Equipment") {
      const { error: eqError } = await supabase.from("equipment").insert({
        item_id,
        low_stock_threshold: newItem.low_stock_threshold ? Number(newItem.low_stock_threshold) : null,
        halo_id: newItem.halo_id.trim() || null,
      });
      if (eqError) { setCreateError(eqError.message); return; }
    } else if (newItem.item_type === "Tool") {
      const { error: toolError } = await supabase.from("tool").insert({
        item_id,
        quantity: newItem.quantity ? Number(newItem.quantity) : null,
      });
      if (toolError) { setCreateError(toolError.message); return; }
    }

    const location_id = newItem.box.trim()
      ? `${newItem.rack.trim()}-${newItem.shelf.trim()}-${newItem.box.trim()}`
      : `${newItem.rack.trim()}-${newItem.shelf.trim()}`;

    const { data: existingLoc } = await supabase
      .from("location")
      .select("location_id")
      .eq("location_id", location_id)
      .maybeSingle();

    if (!existingLoc) {
      const { error: locError } = await supabase.from("location").insert({
        location_id,
        rack: newItem.rack.trim(),
        shelf: newItem.shelf.trim(),
        box: newItem.box.trim() || null,
        box_type: newItem.box_type.trim() || null,
      });
      if (locError) { setCreateError(locError.message); return; }
    }

    const { error: linkError } = await supabase
      .from("item_location")
      .insert({ item_id, location_id });

    if (linkError) { setCreateError(linkError.message); return; }

    setNewItem(defaultNewItem);
    setShowCreate(false);
    await fetchItems(searchTerm.input, boxFilter, sortOrder);
    window.alert("Item added successfully");
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

      {isAdmin && (
        <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "0 1rem 1rem", fontFamily: "Arial" }}>
          <button className="itemButton" onClick={() => { setShowCreate(!showCreate); setCreateError(null); }}>
            {showCreate ? "Cancel" : "+ Add Item"}
          </button>

          {showCreate && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginTop: "0.75rem", maxWidth: "400px" }}>
              <input
                value={newItem.item_name}
                onChange={(e) => setNewItem({ ...newItem, item_name: e.target.value })}
                placeholder="Item name *"
                style={{ padding: "0.3rem", borderRadius: "4px", border: "1px solid #ccc" }}
              />
              <select
                value={newItem.product_group}
                onChange={(e) => setNewItem({ ...newItem, product_group: e.target.value })}
                style={{ padding: "0.3rem", borderRadius: "4px", border: "1px solid #ccc" }}
              >
                <option value="">Select product group</option>
                {productGroups.map((pg) => (
                  <option key={pg} value={pg}>{pg}</option>
                ))}
              </select>
              <textarea
                value={newItem.description}
                onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                placeholder="Description"
                rows={2}
                style={{ padding: "0.3rem", borderRadius: "4px", border: "1px solid #ccc", resize: "vertical" }}
              />
              <select
                value={newItem.item_type}
                onChange={(e) => setNewItem({ ...newItem, item_type: e.target.value as ItemType })}
                style={{ padding: "0.3rem", borderRadius: "4px", border: "1px solid #ccc" }}
              >
                <option value="Tool">Tool</option>
                <option value="Equipment">Equipment</option>
                <option value="Miscellaneous">Miscellaneous</option>
              </select>

              {newItem.item_type === "Equipment" && (
                <>
                  <input
                    type="number"
                    value={newItem.low_stock_threshold}
                    onChange={(e) => setNewItem({ ...newItem, low_stock_threshold: e.target.value })}
                    placeholder="Low stock threshold"
                    style={{ padding: "0.3rem", borderRadius: "4px", border: "1px solid #ccc" }}
                  />
                  <input
                    value={newItem.halo_id}
                    onChange={(e) => setNewItem({ ...newItem, halo_id: e.target.value })}
                    placeholder="Halo ID"
                    style={{ padding: "0.3rem", borderRadius: "4px", border: "1px solid #ccc" }}
                  />
                </>
              )}

              {newItem.item_type === "Tool" && (
                <input
                  type="number"
                  value={newItem.quantity}
                  onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
                  placeholder="Quantity"
                  style={{ padding: "0.3rem", borderRadius: "4px", border: "1px solid #ccc" }}
                />
              )}

              <p style={{ margin: "0.25rem 0 0", fontWeight: "bold", fontSize: "0.9rem" }}>Location</p>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <input
                  value={newItem.rack}
                  onChange={(e) => setNewItem({ ...newItem, rack: e.target.value })}
                  placeholder="Rack *"
                  style={{ padding: "0.3rem", borderRadius: "4px", border: "1px solid #ccc", width: "80px" }}
                />
                <input
                  value={newItem.shelf}
                  onChange={(e) => setNewItem({ ...newItem, shelf: e.target.value })}
                  placeholder="Shelf *"
                  style={{ padding: "0.3rem", borderRadius: "4px", border: "1px solid #ccc", width: "80px" }}
                />
                <input
                  value={newItem.box}
                  onChange={(e) => setNewItem({ ...newItem, box: e.target.value })}
                  placeholder="Box (optional)"
                  style={{ padding: "0.3rem", borderRadius: "4px", border: "1px solid #ccc", flex: 1 }}
                />
              </div>
              {newItem.box.trim() && (
                <input
                  value={newItem.box_type}
                  onChange={(e) => setNewItem({ ...newItem, box_type: e.target.value })}
                  placeholder="Box type (optional)"
                  style={{ padding: "0.3rem", borderRadius: "4px", border: "1px solid #ccc" }}
                />
              )}

              {createError && <p style={{ margin: 0, color: "#c0392b", fontSize: "0.85rem" }}>{createError}</p>}

              <button className="itemButton" onClick={createItem} style={{ alignSelf: "flex-start" }}>
                Save Item
              </button>
            </div>
          )}
        </div>
      )}

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
