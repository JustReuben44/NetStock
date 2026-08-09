const HALO_TIMEOUT_MS = 15000;

let cachedToken: { token: string; expiresAt: number } | null = null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function getHaloToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;

  const res = await fetch(`${requireEnv("HALO_BASE_URL")}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: requireEnv("HALO_CLIENT_ID"),
      client_secret: requireEnv("HALO_CLIENT_SECRET"),
      // Least privilege: set HALO_SCOPE on the production instance (e.g. "edit:items")
      scope: process.env.HALO_SCOPE ?? "all",
    }),
    signal: AbortSignal.timeout(HALO_TIMEOUT_MS),
  });

  if (!res.ok) {
    console.error(`Halo auth failed (status ${res.status})`);
    throw new Error("Halo authentication failed");
  }

  const json = await res.json();
  if (!json.access_token) throw new Error("Halo authentication returned no token");
  cachedToken = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 - 30000 };
  return cachedToken.token;
}

export type HaloStockResult =
  | { ok: true; newStock: number }
  | { ok: false; reason: "not_found" | "insufficient_stock" | "halo_error"; currentStock?: number };

export async function updateHaloStock(haloId: string, quantityChange: number): Promise<HaloStockResult> {
  const numericId = Number(haloId);
  if (!Number.isInteger(numericId) || numericId <= 0) return { ok: false, reason: "not_found" };
  if (!Number.isInteger(quantityChange) || quantityChange === 0) return { ok: false, reason: "halo_error" };

  const baseUrl = requireEnv("HALO_BASE_URL");
  const stockLocationId = Number(requireEnv("HALO_STOCK_LOCATION_ID"));

  let token = await getHaloToken();
  const fetchItem = (t: string) =>
    fetch(`${baseUrl}/api/Item/${numericId}?includedetails=true`, {
      headers: { Authorization: `Bearer ${t}` },
      signal: AbortSignal.timeout(HALO_TIMEOUT_MS),
    });

  let getRes = await fetchItem(token);
  if (getRes.status === 401) {
    token = await getHaloToken(true);
    getRes = await fetchItem(token);
  }
  if (getRes.status === 404) return { ok: false, reason: "not_found" };
  if (!getRes.ok) {
    console.error(`Halo item fetch failed (status ${getRes.status})`);
    return { ok: false, reason: "halo_error" };
  }

  const item = await getRes.json();
  const currentStock = item.quantity_in_stock ?? item.quantity_remaining ?? 0;

  if (quantityChange < 0 && currentStock + quantityChange < 0) {
    return { ok: false, reason: "insufficient_stock", currentStock };
  }
  const newStock = currentStock + quantityChange;

  const movement = {
    id: 0,
    item_id: numericId,
    item_assettype_id: -1,
    stocklocation_id: stockLocationId,
    date: new Date().toISOString(),
    is_stock_take: true,
    cost: 0,
    supplier_id: 0,
    purchaseorder_id: 0,
    purchaseorder_line_id: 0,
    salesorder_id: 0,
    ticket_id: 0,
    stockbin_id: -1,
    delivering_to_user: false,
    note: "",
    quantity_in: quantityChange,
    quantity_issued: quantityChange,
    quantity_remaining: newStock,
    real_quantity_in: quantityChange,
  };

  const postRes = await fetch(`${baseUrl}/api/ItemStock`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify([movement]),
    signal: AbortSignal.timeout(HALO_TIMEOUT_MS),
  });

  if (!postRes.ok) {
    console.error(`Halo stock update failed (status ${postRes.status}):`, await postRes.text());
    return { ok: false, reason: "halo_error" };
  }
  return { ok: true, newStock };
}
