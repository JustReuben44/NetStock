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

  // Fetch current item to get existing stock level
  const getRes = await fetch(`${baseUrl}/api/items/${haloId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!getRes.ok) { console.error("Halo fetch failed:", await getRes.text()); return false; }

  const item = await getRes.json();
  const currentStock = item.stock_number ?? item.instock ?? item.in_stock ?? 0;
  const newStock = Math.max(0, currentStock + quantityChange);

  const postRes = await fetch(`${baseUrl}/api/items`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify([{ id: Number(haloId), stock_number: newStock }]),
  });

  if (!postRes.ok) { console.error("Halo stock update failed:", await postRes.text()); return false; }
  return true;
}
