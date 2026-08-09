import Link from "next/link";
import "./page.css"

export default function AdminPage() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "80vh", gap: "2rem" }}>
      <h2 style={{ textAlign: "center" }}><em>Admin</em></h2>
      <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap", justifyContent: "center", flexDirection: "column"}}>
        <Link href="/admin/settings" className="adminButton">
          Settings
        </Link>
        <Link href="/admin/manage-users" className="adminButton">
          Manage Users
        </Link>
        <Link href="/admin/reports" className="adminButton">
          View Reports
        </Link>
      </div>
    </div>
  )
}
