let cachedToken: { token: string; expiresAt: number } | null = null;

async function getHaloToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;

  const res = await fetch(`${process.env.HALO_BASE_URL}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.HALO_CLIENT_ID!,
      client_secret: process.env.HALO_CLIENT_SECRET!,
      scope: "all",
    }),
  });

  if (!res.ok) throw new Error(`Halo auth failed: ${await res.text()}`);

  const json = await res.json();
  cachedToken = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 - 30000 };
  return cachedToken.token;
}

export async function updateHaloStock(haloId: string, quantityChange: number): Promise<boolean> {
  const token = await getHaloToken();
  const baseUrl = process.env.HALO_BASE_URL;

  const numericId = Number(haloId);

  const getRes = await fetch(`${baseUrl}/api/Item/${numericId}?includedetails=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!getRes.ok) { console.error("Halo fetch failed:", await getRes.text()); return false; }
  const item = await getRes.json();
  const currentStock = item.quantity_in_stock ?? 0;
  const newStock = Math.max(0, currentStock + quantityChange);

  const movement: Record<string, any> = {
    item_id: numericId,
    item_assettype_id: -1,
    stocklocation_id: 20,
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
    quantity_in: quantityChange > 0 ? quantityChange : 0,
    quantity_issued: quantityChange < 0 ? Math.abs(quantityChange) : 0,
    quantity_remaining: newStock,
    real_quantity_in: quantityChange > 0 ? quantityChange : 0,
  };

  const postRes = await fetch(`${baseUrl}/api/ItemStock`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify([movement]),
  });

  if (!postRes.ok) { console.error("Halo stock update failed:", await postRes.text()); return false; }
  return true;
}
