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

  const movement: Record<string, any> = {
    item_id: numericId,
    is_stock_take: false,
  };

  if (quantityChange < 0) {
    movement.quantity_issued = Math.abs(quantityChange);
  } else {
    movement.quantity_in = quantityChange;
  }

  const postRes = await fetch(`${baseUrl}/api/ItemStock`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify([movement]),
  });

  if (!postRes.ok) { console.error("Halo stock update failed:", await postRes.text()); return false; }
  return true;
}
