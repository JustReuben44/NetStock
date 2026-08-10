"use client";
import { createClient } from "@/lib/supabase-client";
import { getOrCreateBasket } from "@/lib/basket";
import { fetchAllRows } from "@/lib/fetch-all";
import { buildSearchDoc, searchItems, type SortMode } from "@/lib/search";
import { useToast } from "@/components/toast";
import { LoadingScreen } from "@/components/loading";
import { BulkAddDrawer } from "@/components/bulk-add";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import Link from "next/link";

const supabase = createClient();

type ItemType = "Tool" | "Equipment" | "Miscellaneous";

const ITEM_TYPES: ItemType[] = ["Tool", "Equipment", "Miscellaneous"];

// Everything the search index needs. The location embed is the form already
// proven on the item detail page; equipment/tool are fetched alongside and
// joined in JS rather than embedded, since no FK-based embed of those two
// exists anywhere else in the app to rely on.
const ITEM_SELECT =
  "item_id, item_name, item_type, product_group, description, " +
  "item_location(location_id, location(rack, shelf, box, box_type))";

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
  const showToast = useToast();
  const [searchInput, setSearchInput] = useState("");
  const [boxFilter, setBoxFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("relevance");
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [basketItemIds, setBasketItemIds] = useState<Set<string>>(new Set());
  const [basketId, setBasketId] = useState<string | null>(null);
  const [errorItemId, setErrorItemId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [newItem, setNewItem] = useState(defaultNewItem);
  const [createError, setCreateError] = useState<string | null>(null);
  const [productGroups, setProductGroups] = useState<string[]>([]);

  // Paged so the list is never silently cut off at PostgREST's max_rows.
  const loadItems = async () => {
    const [rows, equipmentRows, toolRows] = await Promise.all([
      fetchAllRows<any>(() => supabase.from("item").select(ITEM_SELECT).order("item_name")),
      fetchAllRows<any>(() => supabase.from("equipment").select("item_id, halo_id")),
      fetchAllRows<any>(() => supabase.from("tool").select("item_id, quantity")),
    ]);

    const haloById = new Map(equipmentRows.map((r) => [r.item_id, r.halo_id]));
    const quantityById = new Map(toolRows.map((r) => [r.item_id, r.quantity]));

    setItems(
      rows.map((row) => ({
        ...row,
        equipment: haloById.has(row.item_id) ? { halo_id: haloById.get(row.item_id) } : null,
        tool: quantityById.has(row.item_id) ? { quantity: quantityById.get(row.item_id) } : null,
      })),
    );
  };

  const reload = async () => {
    try {
      await loadItems();
      setLoadError(false);
    } catch {
      setLoadError(true);
      showToast("error", "Could not refresh the stock list");
    }
  };

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;

      const [itemResult, bid, { data: userData }, { data: pgData }] = await Promise.all([
        loadItems().then(() => true).catch(() => false),
        getOrCreateBasket(supabase, user.email),
        supabase.from("users").select("role").eq("email_address", user.email).maybeSingle(),
        supabase.from("product_group").select("*").order("product_group"),
      ]);

      if (!itemResult) setLoadError(true);
      if (userData?.role === "Administrator") setIsAdmin(true);
      if (pgData) setProductGroups(pgData.map((r: any) => r.product_group));

      if (!bid) return;

      setBasketId(bid);

      const { data: basketData } = await supabase
        .from("basket_item")
        .select("item_id")
        .eq("basket_id", bid);

      if (basketData) setBasketItemIds(new Set(basketData.map((r) => r.item_id)));
    };
    init().finally(() => setLoading(false));
  }, []);

  const refreshProductGroups = async () => {
    const { data } = await supabase.from("product_group").select("*").order("product_group");
    if (data) setProductGroups(data.map((r: any) => r.product_group));
  };

  // Normalize each row once; re-score on every keystroke against the result.
  const docs = useMemo(() => items.map(buildSearchDoc), [items]);

  const deferredQuery = useDeferredValue(searchInput);
  const deferredBox = useDeferredValue(boxFilter);

  const hasQuery = deferredQuery.trim().length > 0;
  const hasFilters = hasQuery || deferredBox.trim().length > 0 || !!typeFilter || !!groupFilter;
  // "Best match" is meaningless without a query — fall back to A→Z.
  const effectiveSort: SortMode = sortMode === "relevance" && !hasQuery ? "asc" : sortMode;

  const results = useMemo(
    () =>
      searchItems(
        docs,
        { query: deferredQuery, location: deferredBox, itemType: typeFilter, productGroup: groupFilter },
        effectiveSort,
      ),
    [docs, deferredQuery, deferredBox, typeFilter, groupFilter, effectiveSort],
  );

  const cycleSort = () => {
    setSortMode((mode) => {
      if (mode === "relevance") return "asc";
      if (mode === "asc") return "desc";
      return hasQuery ? "relevance" : "asc";
    });
  };

  const clearFilters = () => {
    setSearchInput("");
    setBoxFilter("");
    setTypeFilter("");
    setGroupFilter("");
  };

  const addToBasket = async (itemId: string) => {
    if (!basketId) return;

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
    await reload();
    showToast("success", "Item added successfully");
  };

  return (
    <main>
      <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "1rem" }}>
        <h2 style={{ textAlign: "center" }}><em>Search Stock</em></h2>
        <form onSubmit={(e) => e.preventDefault()} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem", marginBottom: "2rem" }}>
          <input
            type="search"
            placeholder="e.g fibre cables"
            aria-label="Search stock"
            style={{ padding: "0.5rem", fontSize: "1rem", width: "300px", borderRadius: "4px", border: "1px solid #ccc" }}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </form>
      </div>

      {isAdmin && (
        <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "0 1rem 1rem" }}>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button className="itemButton" onClick={() => { setShowCreate(!showCreate); setCreateError(null); }}>
              {showCreate ? "Cancel" : "+ Add Item"}
            </button>
            <button className="itemButton itemButton--ghost" onClick={() => setShowBulkAdd(true)}>
              Bulk Add Items
            </button>
          </div>

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

              {createError && <p style={{ margin: 0, color: "var(--danger)", fontSize: "0.85rem" }}>{createError}</p>}

              <button className="itemButton" onClick={createItem} style={{ alignSelf: "flex-start" }}>
                Save Item
              </button>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <LoadingScreen />
      ) : (
      <>
      <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "0 1rem", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <div style={{ flex: 1, display: "flex", justifyContent: "flex-start", gap: "0.5rem", flexWrap: "wrap" }}>
          <button type="button" className="itemButton" onClick={cycleSort}>
            {effectiveSort === "relevance" ? "Best match" : effectiveSort === "asc" ? "A → Z" : "Z → A"}
          </button>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Filter by type"
            style={{ padding: "0.5rem", borderRadius: "4px", border: "1px solid #ccc" }}
          >
            <option value="">All types</option>
            {ITEM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            aria-label="Filter by product group"
            style={{ padding: "0.5rem", borderRadius: "4px", border: "1px solid #ccc" }}
          >
            <option value="">All groups</option>
            {productGroups.map((pg) => <option key={pg} value={pg}>{pg}</option>)}
          </select>
        </div>
        <p style={{ fontStyle: "italic", margin: 0 }}>
          Showing {results.length}{hasFilters ? ` of ${items.length}` : ""} results
        </p>
        <div style={{ flex: 1, display: "flex", justifyContent: "flex-end" }}>
          <input
            type="search"
            placeholder="search by box"
            aria-label="Filter by rack, shelf or box"
            style={{ padding: "0.5rem", fontSize: "1rem", width: "120px", borderRadius: "4px", border: "1px solid #ccc" }}
            value={boxFilter}
            onChange={(e) => setBoxFilter(e.target.value)}
          />
        </div>
      </div>

      {loadError ? (
        <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "2rem 1rem", textAlign: "center" }}>
          <p style={{ margin: "0 0 0.75rem", color: "var(--danger)" }}>Couldn&apos;t load the stock list.</p>
          <button type="button" className="itemButton" onClick={reload}>Try again</button>
        </div>
      ) : results.length === 0 ? (
        <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "2rem 1rem", textAlign: "center" }}>
          <p style={{ margin: "0 0 0.75rem", fontStyle: "italic" }}>
            {items.length === 0
              ? "No stock items yet."
              : hasQuery
                ? <>No items match &ldquo;{deferredQuery.trim()}&rdquo;.</>
                : "No items match these filters."}
          </p>
          {hasFilters && (
            <button type="button" className="itemButton itemButton--ghost" onClick={clearFilters}>
              Clear filters
            </button>
          )}
        </div>
      ) : (
      <ul style={{ maxWidth: "1000px", margin: "0 auto", padding: "1rem", listStyle: "none" }}>
        {results.map((doc) => {
          const item = doc.row;
          const meta = [
            doc.display.itemType,
            doc.display.productGroup,
            doc.display.quantity != null ? `Qty ${doc.display.quantity}` : "",
            doc.display.locationIds.length
              ? doc.display.locationIds[0] +
                (doc.display.locationIds.length > 1 ? ` +${doc.display.locationIds.length - 1} more` : "")
              : "",
          ].filter(Boolean);

          return (
          <li key={item.item_id} style={{ borderBottom: "1px solid var(--border)", padding: "1rem 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
              <div style={{ minWidth: 0 }}>
                <h4 style={{ margin: "0 0 0.25rem 0" }}>{item.item_name}</h4>
                {meta.length > 0 && (
                  <p style={{ margin: 0, fontSize: "0.8rem", opacity: 0.7 }}>{meta.join(" · ")}</p>
                )}
              </div>
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
                  <Link href={`/${item.item_id}`} className="itemButton">View</Link>
                </div>
                {errorItemId === item.item_id && (
                  <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--danger)" }}>Already in basket</p>
                )}
              </div>
            </div>
          </li>
          );
        })}
      </ul>
      )}
      </>
      )}

      {isAdmin && (
        <BulkAddDrawer
          open={showBulkAdd}
          onClose={() => setShowBulkAdd(false)}
          productGroups={productGroups}
          onImported={() => {
            reload();
            refreshProductGroups();
          }}
        />
      )}
    </main>
  );
}
