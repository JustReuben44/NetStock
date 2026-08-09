"use client";
import '../../globals.css';
import { createClient } from "@/lib/supabase-client";
import { getOrCreateBasket } from "@/lib/basket";
import { useToast } from "@/components/toast";
import { LoadingScreen } from "@/components/loading";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

const supabase = createClient();

type ItemType = "Tool" | "Equipment" | "Miscellaneous";

const emptyNewLocation = { rack: "", shelf: "", box: "", box_type: "" };

export default function ItemDetails() {
  const params = useParams();
  const router = useRouter();
  const showToast = useToast();
  const itemID = params.itemID as string;

  const [item, setItem] = useState<any>(null);
  const [equipment, setEquipment] = useState<any>(null);
  const [tool, setTool] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<any>({});
  const [locationsToRemove, setLocationsToRemove] = useState<string[]>([]);
  const [newLocation, setNewLocation] = useState(emptyNewLocation);
  const [productGroups, setProductGroups] = useState<string[]>([]);
  const [addQty, setAddQty] = useState(1);
  const [basketId, setBasketId] = useState<string | null>(null);
  const [inBasket, setInBasket] = useState(false);
  const [basketError, setBasketError] = useState<string | null>(null);
  const [audits, setAudits] = useState<any[]>([]);

  const loadItem = async () => {
    const [{ data: itemData, error: itemError }, { data: eqData }, { data: toolData }] = await Promise.all([
      supabase.from("item").select("*, item_location(location_id, location(rack, shelf, box, box_type))").eq("item_id", itemID).single(),
      supabase.from("equipment").select("*").eq("item_id", itemID).maybeSingle(),
      supabase.from("tool").select("*").eq("item_id", itemID).maybeSingle(),
    ]);
    if (itemError || !itemData) { setNotFound(true); return; }
    setItem(itemData);
    setEquipment(eqData ?? null);
    setTool(toolData ?? null);

    const { data: auditData } = await supabase
      .from("audit")
      .select("audit_number, email_address, quantity, occurred_at, action")
      .eq("item_id", itemID)
      .order("occurred_at", { ascending: false });
    setAudits(auditData ?? []);
  };

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;

      const [, { data: userData }, { data: pgData }] = await Promise.all([
        loadItem(),
        supabase.from("users").select("role").eq("email_address", user.email).maybeSingle(),
        supabase.from("product_group").select("*").order("product_group"),
      ]);

      if (userData?.role === "Administrator") setIsAdmin(true);
      if (pgData) setProductGroups(pgData.map((r: any) => r.product_group));

      const bid = await getOrCreateBasket(supabase, user.email);
      if (bid) {
        setBasketId(bid);
        const { data: existing } = await supabase.from("basket_item").select("item_id").eq("basket_id", bid).eq("item_id", itemID).maybeSingle();
        if (existing) setInBasket(true);
      }
    };
    init();
  }, [itemID]);

  const startEdit = () => {
    setEditDraft({
      item_name: item.item_name,
      item_type: item.item_type,
      product_group: item.product_group ?? "",
      description: item.description ?? "",
      low_stock_threshold: equipment?.low_stock_threshold ?? "",
      halo_id: equipment?.halo_id ?? "",
      quantity: tool?.quantity ?? "",
    });
    setLocationsToRemove([]);
    setNewLocation(emptyNewLocation);
    setIsEditing(true);
  };

  const toggleRemoveLocation = (location_id: string) => {
    setLocationsToRemove((prev) =>
      prev.includes(location_id) ? prev.filter((id) => id !== location_id) : [...prev, location_id]
    );
  };

  const saveEdit = async () => {
    const { error: itemError } = await supabase.from("item").update({
      item_name: editDraft.item_name,
      item_type: editDraft.item_type,
      product_group: editDraft.product_group || null,
      description: editDraft.description || null,
    }).eq("item_id", itemID);

    if (itemError) { showToast("error", "Failed to update: " + itemError.message); return; }

    if (editDraft.item_type === "Equipment") {
      if (equipment) {
        await supabase.from("equipment").update({
          low_stock_threshold: editDraft.low_stock_threshold !== "" ? Number(editDraft.low_stock_threshold) : null,
          halo_id: editDraft.halo_id || null,
        }).eq("item_id", itemID);
      } else {
        await supabase.from("equipment").insert({
          item_id: itemID,
          low_stock_threshold: editDraft.low_stock_threshold !== "" ? Number(editDraft.low_stock_threshold) : null,
          halo_id: editDraft.halo_id || null,
        });
      }
      if (tool) await supabase.from("tool").delete().eq("item_id", itemID);
    } else if (editDraft.item_type === "Tool") {
      if (tool) {
        await supabase.from("tool").update({
          quantity: editDraft.quantity !== "" ? Number(editDraft.quantity) : null,
        }).eq("item_id", itemID);
      } else {
        await supabase.from("tool").insert({
          item_id: itemID,
          quantity: editDraft.quantity !== "" ? Number(editDraft.quantity) : null,
        });
      }
      if (equipment) await supabase.from("equipment").delete().eq("item_id", itemID);
    } else {
      // Miscellaneous — remove any leftover subtype rows
      if (equipment) await supabase.from("equipment").delete().eq("item_id", itemID);
      if (tool) await supabase.from("tool").delete().eq("item_id", itemID);
    }

    for (const loc_id of locationsToRemove) {
      await supabase.from("item_location").delete().eq("item_id", itemID).eq("location_id", loc_id);
    }

    if (newLocation.rack.trim() && newLocation.shelf.trim()) {
      const location_id = newLocation.box.trim()
        ? `${newLocation.rack.trim()}-${newLocation.shelf.trim()}-${newLocation.box.trim()}`
        : `${newLocation.rack.trim()}-${newLocation.shelf.trim()}`;

      const { data: existingLoc } = await supabase.from("location").select("location_id").eq("location_id", location_id).maybeSingle();
      if (!existingLoc) {
        const { error: locError } = await supabase.from("location").insert({
          location_id,
          rack: newLocation.rack.trim(),
          shelf: newLocation.shelf.trim(),
          box: newLocation.box.trim() || null,
          box_type: newLocation.box_type.trim() || null,
        });
        if (locError) { showToast("error", "Failed to create location: " + locError.message); return; }
      }

      const { data: existingLink } = await supabase.from("item_location").select("item_id").eq("item_id", itemID).eq("location_id", location_id).maybeSingle();
      if (!existingLink) {
        const { error: linkError } = await supabase.from("item_location").insert({ item_id: itemID, location_id });
        if (linkError) { showToast("error", "Failed to link location: " + linkError.message); return; }
      }
    }

    await loadItem();
    setIsEditing(false);
    showToast("success", "Item updated successfully");
  };

  const deleteItem = async () => {
    if (!window.confirm(`Are you sure you want to delete "${item.item_name}"? This also removes its basket entries, borrow records, and audit history.`)) return;

    await supabase.from("basket_item").delete().eq("item_id", itemID);
    await supabase.from("borrow").delete().eq("item_id", itemID);
    await supabase.from("audit").delete().eq("item_id", itemID);
    await supabase.from("item_location").delete().eq("item_id", itemID);
    await supabase.from("equipment").delete().eq("item_id", itemID);
    await supabase.from("tool").delete().eq("item_id", itemID);
    const { error } = await supabase.from("item").delete().eq("item_id", itemID);

    if (error) { showToast("error", "Failed to delete: " + error.message); return; }
    router.push("/");
  };

  const addToBasket = async () => {
    if (!basketId) return;
    if (inBasket) {
      setBasketError("Already in basket");
      setTimeout(() => setBasketError(null), 3000);
      return;
    }
    const { error } = await supabase.from("basket_item").insert({ basket_id: basketId, item_id: itemID, quantity: addQty });
    if (!error) setInBasket(true);
  };

  if (notFound) return (
    <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem", textAlign: "center" }}>
      <p>Item not found.</p>
      <Link href="/" style={{ color: "var(--primary)" }}>Back to search</Link>
    </main>
  );

  if (!item) return (
    <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "2rem" }}>
      <LoadingScreen />
    </main>
  );

  return (
    <main style={{ maxWidth: "1200px", margin: "0 auto", padding: "1rem" }}>
      <div style={{ justifyContent: "space-between", display: "flex", alignItems: "center", marginBottom: "1rem", gap: "1rem", flexWrap: "wrap" }}>
        <Link href="/" style={{ color: "white" }}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" width="28" height="28">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
          </svg>
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          {!isEditing && item.item_type !== "Miscellaneous" && (
            <>
              <input
                type="number"
                min={1}
                value={addQty}
                onChange={(e) => setAddQty(Math.max(1, Number(e.target.value)))}
                style={{ width: "60px", padding: "0.4rem", borderRadius: "4px", border: "1px solid #ccc", fontSize: "1rem" }}
              />
              <button
                className={inBasket ? "itemButton itemButton--added" : "itemButton"}
                onClick={addToBasket}
                style={{ padding: "0.5rem 1rem" }}
              >
                {inBasket ? "Added" : "Add to Basket"}
              </button>
              {basketError && <p style={{ margin: 0, color: "var(--danger)", fontSize: "0.85rem" }}>{basketError}</p>}
            </>
          )}

          {isAdmin && (
            isEditing ? (
              <>
                <button className="itemButton" onClick={saveEdit} style={{ padding: "0.5rem 1rem" }}>Save</button>
                <button className="itemButton itemButton--muted" onClick={() => setIsEditing(false)} style={{ padding: "0.5rem 1rem" }}>Cancel</button>
              </>
            ) : (
              <>
                <button className="itemButton" onClick={startEdit} style={{ padding: "0.5rem 1rem" }}>Edit</button>
                <button className="itemButton itemButton--danger" onClick={deleteItem} style={{ padding: "0.5rem 1rem" }}>Delete</button>
              </>
            )
          )}
        </div>
      </div>

      {isEditing ? (
        <>
          <h2 style={{ textAlign: "center" }}><em>Edit Item</em></h2>
          <div className="card" style={{ maxWidth: "600px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <label><strong>Name</strong></label>
            <input
              value={editDraft.item_name}
              onChange={(e) => setEditDraft({ ...editDraft, item_name: e.target.value })}
              style={{ padding: "0.3rem", borderRadius: "4px", border: "1px solid #ccc" }}
            />
            <label><strong>Description</strong></label>
            <textarea
              value={editDraft.description}
              onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })}
              rows={2}
              style={{ padding: "0.3rem", borderRadius: "4px", border: "1px solid #ccc", resize: "vertical" }}
            />
            <label><strong>Product Group</strong></label>
            <select
              value={editDraft.product_group}
              onChange={(e) => setEditDraft({ ...editDraft, product_group: e.target.value })}
              style={{ padding: "0.3rem", borderRadius: "4px", border: "1px solid #ccc" }}
            >
              <option value="">Select product group</option>
              {productGroups.map((pg) => <option key={pg} value={pg}>{pg}</option>)}
            </select>
            <label><strong>Type</strong></label>
            <select
              value={editDraft.item_type}
              onChange={(e) => setEditDraft({ ...editDraft, item_type: e.target.value as ItemType })}
              style={{ padding: "0.3rem", borderRadius: "4px", border: "1px solid #ccc" }}
            >
              <option value="Tool">Tool</option>
              <option value="Equipment">Equipment</option>
              <option value="Miscellaneous">Miscellaneous</option>
            </select>

            {editDraft.item_type === "Equipment" && (
              <>
                <label><strong>Low Stock Threshold</strong></label>
                <input
                  type="number"
                  value={editDraft.low_stock_threshold}
                  onChange={(e) => setEditDraft({ ...editDraft, low_stock_threshold: e.target.value })}
                  style={{ padding: "0.3rem", borderRadius: "4px", border: "1px solid #ccc" }}
                />
                <label><strong>Halo ID</strong></label>
                <input
                  value={editDraft.halo_id}
                  onChange={(e) => setEditDraft({ ...editDraft, halo_id: e.target.value })}
                  style={{ padding: "0.3rem", borderRadius: "4px", border: "1px solid #ccc" }}
                />
              </>
            )}

            {editDraft.item_type === "Tool" && (
              <>
                <label><strong>Quantity</strong></label>
                <input
                  type="number"
                  value={editDraft.quantity}
                  onChange={(e) => setEditDraft({ ...editDraft, quantity: e.target.value })}
                  style={{ padding: "0.3rem", borderRadius: "4px", border: "1px solid #ccc" }}
                />
              </>
            )}

            <label><strong>Locations</strong></label>
            {item.item_location?.length > 0 ? (
              item.item_location.map((l: any) => (
                <div key={l.location_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.3rem 0.5rem", borderRadius: "4px", border: "1px solid #ccc", backgroundColor: locationsToRemove.includes(l.location_id) ? "rgba(244, 67, 54, 0.15)" : "var(--field)" }}>
                  <span style={{ textDecoration: locationsToRemove.includes(l.location_id) ? "line-through" : "none", fontSize: "0.9rem" }}>
                    {l.location_id}{l.location?.box_type ? ` — ${l.location.box_type}` : ""}
                  </span>
                  <button
                    onClick={() => toggleRemoveLocation(l.location_id)}
                    className={locationsToRemove.includes(l.location_id) ? "itemButton itemButton--muted" : "itemButton itemButton--danger"}
                    style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem" }}
                  >
                    {locationsToRemove.includes(l.location_id) ? "Undo" : "Remove"}
                  </button>
                </div>
              ))
            ) : (
              <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--muted)" }}>No locations assigned</p>
            )}

            <label><strong>Add Location</strong></label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                value={newLocation.rack}
                onChange={(e) => setNewLocation({ ...newLocation, rack: e.target.value })}
                placeholder="Rack"
                style={{ padding: "0.3rem", borderRadius: "4px", border: "1px solid #ccc", width: "80px" }}
              />
              <input
                value={newLocation.shelf}
                onChange={(e) => setNewLocation({ ...newLocation, shelf: e.target.value })}
                placeholder="Shelf"
                style={{ padding: "0.3rem", borderRadius: "4px", border: "1px solid #ccc", width: "80px" }}
              />
              <input
                value={newLocation.box}
                onChange={(e) => setNewLocation({ ...newLocation, box: e.target.value })}
                placeholder="Box (optional)"
                style={{ padding: "0.3rem", borderRadius: "4px", border: "1px solid #ccc", flex: 1 }}
              />
            </div>
            {newLocation.box.trim() && (
              <input
                value={newLocation.box_type}
                onChange={(e) => setNewLocation({ ...newLocation, box_type: e.target.value })}
                placeholder="Box type (optional)"
                style={{ padding: "0.3rem", borderRadius: "4px", border: "1px solid #ccc" }}
              />
            )}
            {newLocation.rack.trim() && newLocation.shelf.trim() && (
              <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--muted)" }}>
                Will create/link: {newLocation.box.trim() ? `${newLocation.rack.trim()}-${newLocation.shelf.trim()}-${newLocation.box.trim()}` : `${newLocation.rack.trim()}-${newLocation.shelf.trim()}`}
              </p>
            )}
          </div>
        </>
      ) : (
        <>
          <h2 style={{ textAlign: "center" }}><em>{item.item_name}</em></h2>
          <div className="card" style={{ maxWidth: "600px", margin: "0 auto" }}>
            <p><strong>Description:</strong> {item.description || "—"}</p>
            <p><strong>Type:</strong> {item.item_type}</p>
            <p><strong>Product Group:</strong> {item.product_group || "—"}</p>
            <p><strong>Location(s):</strong> {item.item_location?.map((l: any) => l.location_id).join(", ") || "—"}</p>
            <p><strong>Box Type:</strong> {item.item_location?.map((l: any) => l.location?.box_type).filter(Boolean).join(", ") || "—"}</p>
            {equipment && (
              <>
                <p><strong>Low Stock Threshold:</strong> {equipment.low_stock_threshold ?? "—"}</p>
                <p><strong>Halo ID:</strong> {equipment.halo_id ?? "—"}</p>
              </>
            )}
            {tool && (
              <p><strong>Quantity:</strong> {tool.quantity ?? "—"}</p>
            )}
          </div>

          <div className="card" style={{ maxWidth: "600px", margin: "1.5rem auto 0" }}>
            <h3 style={{ margin: "0 0 0.75rem 0" }}>Audit Log</h3>
            {audits.length === 0 ? (
              <p style={{ margin: 0, fontStyle: "italic", color: "var(--muted)" }}>No audit records yet.</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {audits.map((a) => (
                  <li key={a.audit_number} style={{ borderBottom: "1px solid var(--border)", padding: "0.5rem 0", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.9rem" }}>
                    <div>
                      <span style={{ fontWeight: "bold", color: a.quantity > 0 ? "var(--success)" : "var(--danger)" }}>
                        {a.quantity > 0 ? `+${a.quantity}` : a.quantity}
                      </span>
                      <span style={{ marginLeft: "0.5rem", fontSize: "0.8rem", color: "var(--muted)", fontStyle: "italic" }}>
                        {a.action === "withdraw" ? "Withdrawn" : a.action === "return" ? "Returned" : a.action === "intake" ? "Stock added" : a.quantity > 0 ? "Added" : "Withdrawn"}
                      </span>
                      <span style={{ marginLeft: "0.75rem", color: "var(--muted)" }}>{a.email_address}</span>
                    </div>
                    <span style={{ color: "var(--muted)" }}>
                      {new Date(a.occurred_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </main>
  );
}
