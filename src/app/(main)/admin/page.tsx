import Link from "next/link";
import "./page.css"

export default function AdminPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "80vh", gap: "2rem" }}>
      <h2 style={{ fontStyle: "italic", fontFamily: "arial" }}>Admin</h2>
      <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap", justifyContent: "center", flexDirection: "column"}}>
        <Link href="/admin/settings" style={{ textDecoration: "none" }}>
          <button className="adminButton">
            Settings
          </button>
        </Link>
        <Link href="/admin/manage-users" style={{ textDecoration: "none" }}>
          <button className="adminButton">
            Manage Users
          </button>
        </Link>
        <Link href="/admin/reports" style={{ textDecoration: "none" }}>
          <button className="adminButton">
            View Reports
          </button>
        </Link>
      </div>
    </div>
  )
}
