"use client";
import { createClient } from "@/lib/supabase-client";
import { useEffect, useState } from "react";
import "../../admin/manage-users/page.css";

const supabase = createClient();

export default function SettingsPage() {
  const [reminderInterval, setReminderInterval] = useState<number | "">("");
  const [reminderDraft, setReminderDraft] = useState<number | "">("");
  const [reminderSaving, setReminderSaving] = useState(false);
  const [reminderMsg, setReminderMsg] = useState<string | null>(null);

  const [productGroups, setProductGroups] = useState<string[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newGroup, setNewGroup] = useState("");
  const [groupMsg, setGroupMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
    fetchProductGroups();
  }, []);

  const fetchSettings = async () => {
    const { data } = await supabase
      .from("setting")
      .select("reminder_interval")
      .eq("setting_id", 1)
      .maybeSingle();
    if (data) {
      setReminderInterval(data.reminder_interval);
      setReminderDraft(data.reminder_interval);
    }
  };

  const fetchProductGroups = async () => {
    const { data } = await supabase
      .from("product_group")
      .select("product_group")
      .order("product_group");
    if (data) setProductGroups(data.map((r: any) => r.product_group));
  };

  const saveReminderInterval = async () => {
    if (reminderDraft === "" || Number(reminderDraft) < 1) {
      setReminderMsg("Please enter a valid interval (min 1).");
      return;
    }
    setReminderSaving(true);
    setReminderMsg(null);
    const { error } = await supabase
      .from("setting")
      .update({ reminder_interval: Number(reminderDraft) })
      .eq("setting_id", 1);
    setReminderSaving(false);
    if (error) {
      setReminderMsg("Failed to save: " + error.message);
    } else {
      setReminderInterval(Number(reminderDraft));
      setReminderMsg("Saved.");
      setTimeout(() => setReminderMsg(null), 2000);
    }
  };

  const createProductGroup = async () => {
    const name = newGroup.trim();
    if (!name) { setGroupMsg("Name cannot be empty."); return; }
    setGroupMsg(null);
    const { error } = await supabase.from("product_group").insert({ product_group: name });
    if (error) {
      setGroupMsg("Failed: " + error.message);
    } else {
      setNewGroup("");
      setShowCreate(false);
      await fetchProductGroups();
    }
  };

  const deleteProductGroup = async (name: string) => {
    if (!window.confirm(`Delete product group "${name}"?`)) return;
    const { error } = await supabase.from("product_group").delete().eq("product_group", name);
    if (!error) await fetchProductGroups();
  };

  return (
    <main>
      <div style={{ maxWidth: "700px", margin: "0 auto", padding: "1rem", fontFamily: "Arial" }}>
        <h2 style={{ textAlign: "center" }}><em>Settings</em></h2>

        {/* Reminder Interval */}
        <h3 style={{ marginBottom: "0.5rem" }}>Reminder Interval</h3>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          <li style={{ borderBottom: "1px solid #ccc", padding: "1rem 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p style={{ margin: 0, fontWeight: "bold" }}>Interval (minutes)</p>
              <p style={{ margin: "0.25rem 0 0", color: "#555" }}>Currently: {reminderInterval !== "" ? `${reminderInterval} minute${reminderInterval === 1 ? "" : "s"}` : "—"}</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input
                type="number"
                min={1}
                value={reminderDraft}
                onChange={(e) => setReminderDraft(e.target.value === "" ? "" : Number(e.target.value))}
                style={{ width: "80px", padding: "0.3rem", borderRadius: "4px", border: "1px solid #ccc" }}
              />
              <button className="itemButton" onClick={saveReminderInterval} disabled={reminderSaving}>
                {reminderSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </li>
          {reminderMsg && (
            <li style={{ padding: "0.5rem 0", color: reminderMsg === "Saved." ? "#27ae60" : "#c0392b", fontStyle: "italic" }}>
              {reminderMsg}
            </li>
          )}
        </ul>

        {/* Product Groups */}
        <h3 style={{ marginTop: "2rem", marginBottom: "0.5rem" }}>Product Groups</h3>
        <div style={{ marginBottom: "0.75rem" }}>
          <button className="itemButton" onClick={() => { setShowCreate(!showCreate); setGroupMsg(null); }}>
            {showCreate ? "Cancel" : "+ Create Product Group"}
          </button>
          {showCreate && (
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", alignItems: "center" }}>
              <input
                value={newGroup}
                onChange={(e) => setNewGroup(e.target.value)}
                placeholder="Group name"
                style={{ padding: "0.3rem", borderRadius: "4px", border: "1px solid #ccc", flex: 1 }}
              />
              <button className="itemButton" onClick={createProductGroup}>Add</button>
            </div>
          )}
          {groupMsg && (
            <p style={{ margin: "0.5rem 0 0", color: "#c0392b", fontSize: "0.85rem" }}>{groupMsg}</p>
          )}
        </div>

        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {productGroups.length === 0 && (
            <li style={{ padding: "1rem 0", color: "#888", fontStyle: "italic" }}>No product groups yet.</li>
          )}
          {productGroups.map((group) => (
            <li key={group} style={{ borderBottom: "1px solid #ccc", padding: "0.75rem 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>{group}</span>
              <button className="itemButton" onClick={() => deleteProductGroup(group)}>Delete</button>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
