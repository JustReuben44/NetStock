"use client";
import { createClient } from "@/lib/supabase-client";
import { useEffect, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import "./page.css";

const supabase = createClient();

async function getOrCreateBasket(email: string): Promise<string | null> {
    const { data: existing, error: fetchError } = await supabase
        .from("basket")
        .select("basket_id")
        .eq("email_address", email)
        .eq("status", "active")
        .maybeSingle();

    if (existing) return existing.basket_id;
    if (fetchError) console.log("[basket] fetch error:", fetchError.message);

    const { data: created, error: createError } = await supabase
        .from("basket")
        .insert({ email_address: email })
        .select("basket_id")
        .single();

    if (createError) console.log("[basket] create error:", createError.message);
    return created?.basket_id ?? null;
}

export default function ScanQrCode() {
    const [scannedResult, setScannedResult] = useState<string | null>(null);
    const [items, setItems] = useState<any[]>([]);
    const [basketItemIds, setBasketItemIds] = useState<Set<string>>(new Set());
    const [basketId, setBasketId] = useState<string | null>(null);
    const [errorItemId, setErrorItemId] = useState<string | null>(null);

    useEffect(() => {
        const init = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user?.email) return;

            const bid = await getOrCreateBasket(user.email);
            if (!bid) return;

            setBasketId(bid);

            const { data: basketData } = await supabase
                .from("basket_item")
                .select("item_id")
                .eq("basket_id", bid);

            if (basketData) setBasketItemIds(new Set(basketData.map((r: any) => r.item_id)));
        };
        init();
    }, []);

    useEffect(() => {
        const scanner = new Html5Qrcode("reader");

        scanner.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: 250 },
            (decodedText) => {
                setScannedResult(decodedText);
            },
            (error) => {
                console.warn(error);
            }
        );
        
        return () => {
            scanner.stop().then(() => scanner.clear()).catch(console.error);
        };
    }, []);

    useEffect(() => {
        if (!scannedResult) return;
        
        const retrieveItems = async () => {

            const {data, error} = await supabase
                .from("item_location")
                .select("item_id, item(item_id,item_name, item_type)")
                .eq("location_id", scannedResult);

            if (!error && data) {
            setItems(data.map((row: any) => row.item));
            }
        };

        retrieveItems();

    }, [scannedResult]);

    const addToBasket = async (itemId: string) => {
        if (!basketId) return;

        if (basketItemIds.has(itemId)) {
            setErrorItemId(itemId);
            setTimeout(() => setErrorItemId(null), 3000);
            return;
        }

        const { error } = await supabase
            .from("basket_item")
            .insert({ basket_id: basketId, item_id: itemId, quantity: 1 });

        if (!error) {
            setBasketItemIds((prev) => new Set(prev).add(itemId));
        }
    };

    return (
        <>
            <div id="reader"></div>

            <div style={{
                position: "fixed",
                bottom: 0,
                left: 0,
                right: 0,
                padding: "1rem",
                borderTop: "1px solid #333",
                background: "#111",
                display: "flex",
                justifyContent: "center",
                fontFamily: "Arial",
            }}>
                <h2>{scannedResult ? scannedResult : "No Item Found"}</h2>
                <ul style={{ maxWidth: "1000px", margin: "0 auto", padding: "1rem", fontFamily: "Arial", listStyle: "none" }}>
        {items.map((item, key) => (
          <li key={key} style={{ borderBottom: "1px solid #ccc", padding: "1rem 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <h4 style={{ margin: "0 0 0.5rem 0" }}>{item.item_name}</h4>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.25rem" }}>
                <div style={{ display: "flex", gap: "1rem" }}>
                  {item.item_type !== "Miscellaneous" && (
                  <button
                    className={basketItemIds.has(item.item_id) ? "itemButton itemButton--added" : "itemButton"}
                    onClick={() => addToBasket(item.item_id)}
                  >
                    {basketItemIds.has(item.item_id) ? "Added" : "Add"}
                  </button>
                  )}
                  <a href={`/${item.item_id}`} target="_blank" rel="noopener noreferrer">
                    <button className="itemButton">View</button>
                  </a>
                </div>
                {errorItemId === item.item_id && (
                  <p style={{ margin: 0, fontSize: "0.8rem", color: "#c0392b" }}>Already in basket</p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
            </div>
        </>
    );


} 
