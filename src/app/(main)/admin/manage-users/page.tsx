"use client"
import { createClient } from "@/lib/supabase-client";
import { useEffect, useState } from "react";
import "./page.css";

const supabase = createClient();

export default function ShowUsers() {
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
    if (search) {
      query = query.or(`name.ilike.%${search}%,surname.ilike.%${search}%,email_address.ilike.%${search}%,role.ilike.%${search}%`);
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
    if (!window.confirm(`Are you sure you want to delete ${name}?`)) return;
    const { error } = await supabase.from("users").delete().eq("email_address", email);
    if (!error) {
      await fetchUsers(searchTerm.input, sortOrder);
    } else {
      console.error("Delete failed", error.message);
    }
  };

  const saveEdit = async (email: string) => {
    const { error } = await supabase.from("users").update(editDraft).eq("email_address", email);
    if (!error) {
      setEditingId(null);
      setEditDraft({});
      await fetchUsers(searchTerm.input, sortOrder);
    } else {
      console.error("Update failed", error.message);
    }
  };

  const createUser = async () => {
    const { error } = await supabase.from("users").insert(newUser);
    if (!error) {
      setNewUser({ name: "", surname: "", email_address: "", role: "Staff" });
      setShowCreate(false);
      await fetchUsers(searchTerm.input, sortOrder);
      window.alert("User created successfully");
    } else {
      console.error("Create failed", error.message);
    }
  };

  return (
    <main>
      <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "1rem", fontFamily: "Arial" }}>
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

      <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "0 1rem 1rem", fontFamily: "Arial" }}>
        <button className="itemButton" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? "Cancel" : "+ Create User"}
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

      <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "0 1rem", display: "flex", alignItems: "center", fontFamily: "Arial" }}>
        <div style={{ flex: 1, display: "flex", justifyContent: "flex-start" }}>
          <button type="button" className="itemButton" onClick={toggleSort}>
            {sortOrder === "asc" ? "A → Z" : "Z → A"}
          </button>
        </div>
        <p style={{ fontStyle: "italic", margin: 0 }}>Showing {users.length} results</p>
      </div>

      <ul style={{ maxWidth: "1000px", margin: "0 auto", padding: "1rem", fontFamily: "Arial", listStyle: "none" }}>
        {users.map((user, key) => {
          const isEditing = editingId === user.email_address;
          return (
            <li key={key} style={{ borderBottom: "1px solid #ccc", padding: "1rem 0" }}>
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
                      onChange={(e) => setEditDraft({ ...editDraft, email_address: e.target.value })}
                      placeholder="Email"
                      style={{ padding: "0.3rem", borderRadius: "4px", border: "1px solid #ccc" }}
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
                      {isEditing ? "Save" : "Update"}
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
