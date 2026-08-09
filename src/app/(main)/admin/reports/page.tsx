"use client";
import { createClient } from "@/lib/supabase-client";
import { Spinner } from "@/components/loading";
import { useEffect, useState } from "react";

const supabase = createClient();

type ReportType = "users" | "items";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthOptions() {
  const options: { label: string; value: string }[] = [{ label: "All time", value: "" }];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push({
      label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    });
  }
  return options;
}

export default function ReportsPage() {
  const [reportType, setReportType] = useState<ReportType>("users");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [userReport, setUserReport] = useState<{ email_address: string; total: number }[]>([]);
  const [itemReport, setItemReport] = useState<{ item_id: string; item_name: string; total: number }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadReport(reportType, selectedMonth);
  }, [reportType, selectedMonth]);

  const loadReport = async (type: ReportType, month: string) => {
    setLoading(true);

    const dateFilter = (q: any) => {
      if (!month) return q;
      const [year, m] = month.split("-").map(Number);
      const start = new Date(year, m - 1, 1).toISOString();
      const end = new Date(year, m, 1).toISOString();
      return q.gte("occurred_at", start).lt("occurred_at", end);
    };

    if (type === "users") {
      const { data, error } = await dateFilter(
        supabase.from("audit").select("email_address, quantity").lt("quantity", 0)
      );
      if (!error && data) {
        const totals: Record<string, number> = {};
        for (const row of data) {
          totals[row.email_address] = (totals[row.email_address] ?? 0) + Math.abs(row.quantity);
        }
        setUserReport(
          Object.entries(totals)
            .map(([email_address, total]) => ({ email_address, total }))
            .sort((a, b) => b.total - a.total)
        );
      }
    } else {
      const { data, error } = await dateFilter(
        supabase.from("audit").select("item_id, quantity, item(item_name)").lt("quantity", 0)
      );
      if (!error && data) {
        const totals: Record<string, { item_name: string; total: number }> = {};
        for (const row of data) {
          const name = (row.item as any)?.item_name ?? row.item_id;
          if (!totals[row.item_id]) totals[row.item_id] = { item_name: name, total: 0 };
          totals[row.item_id].total += Math.abs(row.quantity);
        }
        setItemReport(
          Object.entries(totals)
            .map(([item_id, { item_name, total }]) => ({ item_id, item_name, total }))
            .sort((a, b) => b.total - a.total)
        );
      }
    }

    setLoading(false);
  };

  const months = monthOptions();
  const rows = reportType === "users" ? userReport : itemReport;

  return (
    <main style={{ maxWidth: "700px", margin: "0 auto", padding: "1rem" }}>
      <h2 style={{ textAlign: "center" }}><em>Reports</em></h2>

      <div style={{ display: "flex", justifyContent: "center", gap: "1rem", marginBottom: "1rem" }}>
        <button
          className={reportType === "users" ? "itemButton" : "itemButton itemButton--ghost"}
          onClick={() => setReportType("users")}
        >
          Top Users
        </button>
        <button
          className={reportType === "items" ? "itemButton" : "itemButton itemButton--ghost"}
          onClick={() => setReportType("items")}
        >
          Top Items
        </button>
      </div>

      <div style={{ display: "flex", justifyContent: "center", marginBottom: "1.5rem" }}>
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          style={{ fontSize: "0.9rem", padding: "0.3rem 0.6rem", cursor: "pointer" }}
        >
          {months.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "2rem" }}>
          <Spinner />
        </div>
      ) : (
        <>
          <p style={{ textAlign: "center", fontStyle: "italic" }}>
            {reportType === "users" ? "Users" : "Items"} ranked by total quantity withdrawn
            {selectedMonth ? ` — ${months.find(m => m.value === selectedMonth)?.label}` : " — All time"}
          </p>
          {rows.length === 0 ? (
            <p style={{ textAlign: "center", color: "var(--muted)" }}>No withdrawal data for this period.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: "0 1rem" }}>
              {rows.map((row: any, i) => (
                <li key={row.email_address ?? row.item_id} style={{ borderBottom: "1px solid var(--border)", padding: "0.75rem 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <span style={{ fontWeight: "bold", color: "var(--muted)", minWidth: "1.5rem" }}>#{i + 1}</span>
                    <span>{row.email_address ?? row.item_name}</span>
                  </div>
                  <span style={{ fontWeight: "bold" }}>{row.total} withdrawn</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
