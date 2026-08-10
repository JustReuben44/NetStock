"use client";
import { createClient } from "@/lib/supabase-client";
import { fetchAllRows } from "@/lib/fetch-all";
import { useToast } from "@/components/toast";
import { useRef, useState } from "react";

const supabase = createClient();

const TEMPLATE_HEADERS = [
  "itemName", "itemType", "productGroup", "description",
  "quantity", "lowStockThreshold", "haloId",
  "rack", "shelf", "box", "boxType",
];

const TEMPLATE_EXAMPLES = [
  ["EXAMPLE Screwdriver (delete this row)", "Tool", "", "Phillips head", "10", "", "", "R1", "S1", "", ""],
  ["EXAMPLE Patch Cable (delete this row)", "Equipment", "", "LC LC/UPC - 1m", "", "5", "123", "R1", "S2", "B3", "Small"],
];

// Minimal CSV parser: handles quoted fields, embedded commas/newlines, CRLF
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row); row = [];
    } else field += c;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

const normalizeHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

type ParsedRow = {
  line: number;
  item_name: string;
  item_type: string;
  product_group: string;
  description: string;
  quantity: string;
  low_stock_threshold: string;
  halo_id: string;
  rack: string;
  shelf: string;
  box: string;
  box_type: string;
  newGroup?: boolean;
  errors: string[];
  status?: "ok" | "failed";
  failReason?: string;
};

export function BulkAddDrawer({
  open,
  onClose,
  productGroups,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  productGroups: string[];
  onImported: () => void;
}) {
  const showToast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);

  const downloadTemplate = () => {
    const lines = [TEMPLATE_HEADERS.join(","), ...TEMPLATE_EXAMPLES.map((r) => r.join(","))];
    // BOM so Excel opens it as UTF-8
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "netstock-items-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = async (file: File) => {
    setFileError(null);
    setRows([]);
    setDone(false);

    const text = await file.text();
    if (text.startsWith("PK")) {
      setFileError("This looks like an Excel .xlsx file — in Excel use File → Save As → CSV, then upload the .csv.");
      return;
    }

    const parsed = parseCsv(text.replace(/^﻿/, ""));
    if (parsed.length < 2) {
      setFileError("The file has no data rows. Download the template, add your items below the header row, and re-upload.");
      return;
    }

    const headers = parsed[0].map(normalizeHeader);
    const col = (name: string) => headers.indexOf(normalizeHeader(name));
    if (col("itemName") === -1 || col("itemType") === -1) {
      setFileError("Unrecognised columns — the file must contain at least itemName and itemType. Download the template for the expected layout.");
      return;
    }

    // Must be paged — a truncated list would let real duplicates through.
    let existingData: { item_name: string }[];
    try {
      existingData = await fetchAllRows<{ item_name: string }>(() =>
        supabase.from("item").select("item_name"),
      );
    } catch {
      setFileError("Couldn't check for existing items. Check your connection and try again.");
      return;
    }
    const existingNames = new Set(existingData.map((r) => r.item_name.trim().toLowerCase()));
    const groupLookup = new Map(productGroups.map((g) => [g.trim().toLowerCase(), g]));
    const newGroupKeys = new Set<string>();
    const seenInFile = new Set<string>();

    const get = (r: string[], name: string) => {
      const i = col(name);
      return i === -1 ? "" : (r[i] ?? "").trim();
    };

    const result: ParsedRow[] = parsed.slice(1).map((r, idx) => {
      const row: ParsedRow = {
        line: idx + 2,
        item_name: get(r, "itemName"),
        item_type: get(r, "itemType"),
        product_group: get(r, "productGroup"),
        description: get(r, "description"),
        quantity: get(r, "quantity"),
        low_stock_threshold: get(r, "lowStockThreshold"),
        halo_id: get(r, "haloId"),
        rack: get(r, "rack"),
        shelf: get(r, "shelf"),
        box: get(r, "box"),
        box_type: get(r, "boxType"),
        errors: [],
      };

      if (!row.item_name) row.errors.push("itemName is required");
      if (row.item_name.toUpperCase().startsWith("EXAMPLE")) row.errors.push("Example row — delete it from the file");

      const typeMatch = ["Tool", "Equipment", "Miscellaneous"].find(
        (t) => t.toLowerCase() === row.item_type.toLowerCase()
      );
      if (!typeMatch) row.errors.push(`itemType must be Tool, Equipment or Miscellaneous (got "${row.item_type || "blank"}")`);
      else row.item_type = typeMatch;

      const nameKey = row.item_name.toLowerCase();
      if (nameKey) {
        if (existingNames.has(nameKey)) row.errors.push("An item with this name already exists");
        if (seenInFile.has(nameKey)) row.errors.push("Duplicate name within this file");
        seenInFile.add(nameKey);
      }

      if (row.product_group) {
        const key = row.product_group.toLowerCase();
        const canonical = groupLookup.get(key);
        if (canonical) {
          row.product_group = canonical;
          if (newGroupKeys.has(key)) row.newGroup = true;
        } else {
          // Unknown group — it will be created on import. First occurrence
          // fixes the casing for every other row in the file.
          groupLookup.set(key, row.product_group);
          newGroupKeys.add(key);
          row.newGroup = true;
        }
      }

      if (row.quantity && row.item_type !== "Tool") row.errors.push("quantity only applies to Tools");
      if (row.quantity && !/^\d+$/.test(row.quantity)) row.errors.push("quantity must be a whole number");
      if (row.low_stock_threshold && row.item_type !== "Equipment") row.errors.push("lowStockThreshold only applies to Equipment");
      if (row.low_stock_threshold && !/^\d+$/.test(row.low_stock_threshold)) row.errors.push("lowStockThreshold must be a whole number");
      if (row.halo_id && row.item_type !== "Equipment") row.errors.push("haloId only applies to Equipment");
      if (row.halo_id && !/^\d+$/.test(row.halo_id)) row.errors.push("haloId must be a number");

      if ((row.rack && !row.shelf) || (!row.rack && row.shelf)) row.errors.push("rack and shelf must be provided together");
      if (row.box && (!row.rack || !row.shelf)) row.errors.push("box requires rack and shelf");

      return row;
    });

    setRows(result);
  };

  const validRows = rows.filter((r) => r.errors.length === 0);

  const runImport = async () => {
    setImporting(true);
    const updated = [...rows];

    // Create any new product groups first so item inserts can reference them
    const newGroups = [...new Set(
      updated.filter((r) => r.errors.length === 0 && r.newGroup).map((r) => r.product_group)
    )];
    const failedGroups = new Set<string>();
    for (const group of newGroups) {
      const { error } = await supabase.from("product_group").insert({ product_group: group });
      if (error) {
        // Might already exist (created since validation) — only fail if it truly doesn't
        const { data: check } = await supabase
          .from("product_group")
          .select("product_group")
          .eq("product_group", group)
          .maybeSingle();
        if (!check) failedGroups.add(group);
      }
    }

    for (const row of updated) {
      if (row.errors.length > 0) continue;

      if (row.newGroup && failedGroups.has(row.product_group)) {
        row.status = "failed";
        row.failReason = `Could not create product group "${row.product_group}"`;
        setRows([...updated]);
        continue;
      }

      const { data: itemData, error: itemError } = await supabase
        .from("item")
        .insert({
          item_name: row.item_name,
          item_type: row.item_type,
          product_group: row.product_group || null,
          description: row.description || null,
        })
        .select("item_id")
        .single();

      if (itemError || !itemData) {
        row.status = "failed";
        row.failReason = itemError?.message ?? "Failed to create item";
        setRows([...updated]);
        continue;
      }

      const item_id = itemData.item_id;

      if (row.item_type === "Equipment") {
        const { error } = await supabase.from("equipment").insert({
          item_id,
          low_stock_threshold: row.low_stock_threshold ? Number(row.low_stock_threshold) : null,
          halo_id: row.halo_id || null,
        });
        if (error) { row.status = "failed"; row.failReason = error.message; setRows([...updated]); continue; }
      } else if (row.item_type === "Tool") {
        const { error } = await supabase.from("tool").insert({
          item_id,
          quantity: row.quantity ? Number(row.quantity) : null,
        });
        if (error) { row.status = "failed"; row.failReason = error.message; setRows([...updated]); continue; }
      }

      if (row.rack && row.shelf) {
        const location_id = row.box
          ? `${row.rack}-${row.shelf}-${row.box}`
          : `${row.rack}-${row.shelf}`;

        const { data: existingLoc } = await supabase
          .from("location")
          .select("location_id")
          .eq("location_id", location_id)
          .maybeSingle();

        if (!existingLoc) {
          await supabase.from("location").insert({
            location_id,
            rack: row.rack,
            shelf: row.shelf,
            box: row.box || null,
            box_type: row.box_type || null,
          });
        }
        await supabase.from("item_location").insert({ item_id, location_id });
      }

      row.status = "ok";
      setRows([...updated]);
    }

    setImporting(false);
    setDone(true);
    const okCount = updated.filter((r) => r.status === "ok").length;
    const failCount = updated.filter((r) => r.status === "failed").length;
    showToast(failCount > 0 ? "error" : "success", `Imported ${okCount} item(s)${failCount > 0 ? `, ${failCount} failed` : ""}`);
    if (okCount > 0) onImported();
  };

  const reset = () => {
    setRows([]);
    setFileError(null);
    setDone(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <>
      <div className={`overlay${open ? " open" : ""}`} onClick={onClose} />
      <aside className={`drawer${open ? " open" : ""}`} aria-hidden={!open}>
        <div className="drawerHeader">
          <h3>Bulk Add Items</h3>
          <button className="menu" onClick={onClose} aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" width="24" height="24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="drawerBody">
          <p style={{ margin: 0, fontSize: "0.9rem", color: "var(--muted)" }}>
            1. Download the template and open it in Excel.<br />
            2. Add one row per item (delete the example rows). <strong>quantity</strong> is for Tools;{" "}
            <strong>lowStockThreshold</strong> and <strong>haloId</strong> are for Equipment.
            Product groups that don&apos;t exist yet are created automatically.<br />
            3. Save as CSV and upload it here.
          </p>

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button className="itemButton" onClick={downloadTemplate}>Download Template</button>
            <button className="itemButton itemButton--ghost" onClick={() => fileRef.current?.click()}>
              Upload CSV
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </div>

          {fileError && (
            <p style={{ margin: 0, color: "var(--danger)", fontSize: "0.85rem" }}>{fileError}</p>
          )}

          {rows.length > 0 && (
            <>
              <p style={{ margin: 0, fontSize: "0.9rem" }}>
                {validRows.length} of {rows.length} row(s) ready to import
                {rows.length - validRows.length > 0 && `, ${rows.length - validRows.length} with problems`}
              </p>

              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {rows.map((row) => (
                  <li
                    key={row.line}
                    style={{
                      padding: "0.5rem 0.6rem",
                      borderRadius: "4px",
                      border: "1px solid var(--border)",
                      fontSize: "0.85rem",
                      background:
                        row.status === "ok" ? "rgba(39, 174, 96, 0.12)" :
                        row.status === "failed" || row.errors.length > 0 ? "rgba(244, 67, 54, 0.12)" :
                        "transparent",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                      <span style={{ fontWeight: "bold" }}>
                        Row {row.line}: {row.item_name || "(no name)"}
                      </span>
                      <span style={{ color: "var(--muted)", flexShrink: 0 }}>
                        {row.status === "ok" ? "Imported" : row.status === "failed" ? "Failed" : row.item_type}
                      </span>
                    </div>
                    {row.errors.length > 0 && (
                      <p style={{ margin: "0.25rem 0 0", color: "var(--danger)" }}>{row.errors.join("; ")}</p>
                    )}
                    {row.newGroup && row.errors.length === 0 && !row.status && (
                      <p style={{ margin: "0.25rem 0 0", color: "var(--muted)" }}>
                        New product group &quot;{row.product_group}&quot; will be created
                      </p>
                    )}
                    {row.failReason && (
                      <p style={{ margin: "0.25rem 0 0", color: "var(--danger)" }}>{row.failReason}</p>
                    )}
                  </li>
                ))}
              </ul>

              <div style={{ display: "flex", gap: "0.5rem", paddingBottom: "1rem" }}>
                {!done && (
                  <button
                    className="itemButton"
                    onClick={runImport}
                    disabled={importing || validRows.length === 0}
                  >
                    {importing ? "Importing..." : `Import ${validRows.length} item(s)`}
                  </button>
                )}
                <button className="itemButton itemButton--muted" onClick={reset} disabled={importing}>
                  {done ? "Import Another File" : "Clear"}
                </button>
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
