"use client"
import { createClient } from "@/lib/supabase-client";
import { sanitizeSearch } from "@/lib/search";
import { useToast } from "@/components/toast";
import { useEffect, useState } from "react";

const supabase = createClient();

export default function ShowUsers() {
  const showToast = useToast();
  const [searchTerm, setSearchTerm] = useState({ input: "" });
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [users, setUsers] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<any>({});
  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState({ name: "", surname: "", email_address: "", role: "Staff" });

  useEffect(() => {
    fetchUsers("", "asc");
  }, []);

  const fetchUsers = async (search: string, order: "asc" | "desc") => {
    let query = supabase.from("users").select("*");
    const term = sanitizeSearch(search);
    if (term) {
      query = query.or(`name.ilike.%${term}%,surname.ilike.%${term}%,email_address.ilike.%${term}%,role.ilike.%${term}%`);
    }
    query = query.order("name", { ascending: order === "asc" });
    const { data, error } = await query;
    if (!error && data) setUsers(data);
  };

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    fetchUsers(searchTerm.input, sortOrder);
  };

  const toggleSort = () => {
    const next = sortOrder === "asc" ? "desc" : "asc";
    setSortOrder(next);
    fetchUsers(searchTerm.input, next);
  };

  const startEdit = (user: any) => {
    setEditingId(user.email_address);
    setEditDraft({ name: user.name, surname: user.surname, email_address: user.email_address, role: user.role });
  };

  const deleteUser = async (email: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete ${name}? This also signs them out and removes their login.`)) return;
    const res = await fetch("/api/admin/delete-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (res.ok) {
      showToast("success", `${name} deleted`);
      await fetchUsers(searchTerm.input, sortOrder);
    } else {
      const errJson = await res.json().catch(() => null);
      showToast("error", errJson?.error ?? "Failed to delete user");
    }
  };

  const saveEdit = async (email: string) => {
    // email_address is the account key (Azure login + baskets/borrows link
    // to it) — it is deliberately not editable
    const { error } = await supabase
      .from("users")
      .update({ name: editDraft.name, surname: editDraft.surname, role: editDraft.role })
      .eq("email_address", email);
    if (!error) {
      setEditingId(null);
      setEditDraft({});
      await fetchUsers(searchTerm.input, sortOrder);
      showToast("success", "User updated");
    } else {
      showToast("error", "Update failed: " + error.message);
    }
  };

  const createUser = async () => {
    const name = newUser.name.trim();
    const surname = newUser.surname.trim();
    const email = newUser.email_address.trim().toLowerCase();

    if (!name || !surname || !email) {
      showToast("error", "Name, surname and email are all required");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showToast("error", "Please enter a valid email address");
      return;
    }

    const { error } = await supabase
      .from("users")
      .insert({ name, surname, email_address: email, role: newUser.role });
    if (!error) {
      setNewUser({ name: "", surname: "", email_address: "", role: "Staff" });
      setShowCreate(false);
      await fetchUsers(searchTerm.input, sortOrder);
      showToast("success", "User created successfully");
    } else {
      showToast("error", "Create failed: " + error.message);
    }
  };

  return (
    <main>
      <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "1rem" }}>
        <h2 style={{ textAlign: "center" }}><em>Manage Users</em></h2>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem", marginBottom: "2rem" }}>
          <input
            type="text"
            placeholder="search users"
            style={{ padding: "0.5rem", fontSize: "1rem", width: "300px", borderRadius: "4px", border: "1px solid #ccc" }}
            value={searchTerm.input}
            onChange={(e) => setSearchTerm({ ...searchTerm, input: e.target.value })}
          />
        </form>
      </div>

      <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "0 1rem 1rem" }}>
        <button className="itemButton" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? "Cancel" : "+ Add User"}
        </button>
        {showCreate && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginTop: "0.75rem" }}>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                placeholder="First name"
                style={{ padding: "0.3rem", borderRadius: "4px", border: "1px solid #ccc" }}
              />
              <input
                value={newUser.surname}
                onChange={(e) => setNewUser({ ...newUser, surname: e.target.value })}
                placeholder="Surname"
                style={{ padding: "0.3rem", borderRadius: "4px", border: "1px solid #ccc" }}
              />
            </div>
            <input
              value={newUser.email_address}
              onChange={(e) => setNewUser({ ...newUser, email_address: e.target.value })}
              placeholder="Email"
              style={{ padding: "0.3rem", borderRadius: "4px", border: "1px solid #ccc" }}
            />
            <select
              value={newUser.role}
              onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
              style={{ padding: "0.3rem", borderRadius: "4px", border: "1px solid #ccc" }}
            >
              <option value="Staff">Staff</option>
              <option value="Administrator">Administrator</option>
            </select>
            <button className="itemButton" onClick={createUser} style={{ alignSelf: "flex-start" }}>
              Save User
            </button>
          </div>
        )}
      </div>

      <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "0 1rem", display: "flex", alignItems: "center" }}>
        <div style={{ flex: 1, display: "flex", justifyContent: "flex-start" }}>
          <button type="button" className="itemButton" onClick={toggleSort}>
            {sortOrder === "asc" ? "A → Z" : "Z → A"}
          </button>
        </div>
        <p style={{ fontStyle: "italic", margin: 0 }}>Showing {users.length} results</p>
      </div>

      <ul style={{ maxWidth: "1000px", margin: "0 auto", padding: "1rem", listStyle: "none" }}>
        {users.map((user, key) => {
          const isEditing = editingId === user.email_address;
          return (
            <li key={key} style={{ borderBottom: "1px solid var(--border)", padding: "1rem 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {isEditing ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <input
                        value={editDraft.name}
                        onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                        placeholder="First name"
                        style={{ padding: "0.3rem", borderRadius: "4px", border: "1px solid #ccc" }}
                      />
                      <input
                        value={editDraft.surname}
                        onChange={(e) => setEditDraft({ ...editDraft, surname: e.target.value })}
                        placeholder="Surname"
                        style={{ padding: "0.3rem", borderRadius: "4px", border: "1px solid #ccc" }}
                      />
                    </div>
                    <input
                      value={editDraft.email_address}
                      disabled
                      title="Email is the account key and cannot be changed — delete the user and re-create them instead"
                      style={{ padding: "0.3rem", borderRadius: "4px", border: "1px solid #ccc", opacity: 0.6, cursor: "not-allowed" }}
                    />
                    <select
                      value={editDraft.role}
                      onChange={(e) => setEditDraft({ ...editDraft, role: e.target.value })}
                      style={{ padding: "0.3rem", borderRadius: "4px", border: "1px solid #ccc" }}
                    >
                      <option value="Staff">Staff</option>
                      <option value="Administrator">Administrator</option>
                    </select>
                  </div>
                ) : (
                  <div>
                    <h4 style={{ margin: "0 0 0.25rem 0" }}>{user.name} {user.surname}</h4>
                    <p style={{ margin: "0 0 0.1rem 0" }}>Email: {user.email_address}</p>
                    <p style={{ margin: 0 }}>Role: {user.role}</p>
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", alignItems: "flex-end" }}>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      className="itemButton"
                      onClick={() => isEditing ? saveEdit(user.email_address) : startEdit(user)}
                    >
                      {isEditing ? "Save" : "Edit"}
                    </button>
                    {!isEditing && (
                      <button
                        className="itemButton"
                        onClick={() => deleteUser(user.email_address, `${user.name} ${user.surname}`)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                  {isEditing && (
                    <button
                      className="itemButton"
                      onClick={() => { setEditingId(null); setEditDraft({}); }}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
