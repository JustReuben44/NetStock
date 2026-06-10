import '../../globals.css';
import { createClient } from "@/lib/supabase-server";
import { notFound } from "next/navigation";
import Link from "next/link";

export default async function ItemDetails({ params }: { params: { itemID: string } }) {
    const supabase = await createClient();
    const { itemID } = await params
    const { data, error } = await supabase.from("item").select("*, item_location(location_id, location(box_type))").eq("item_id", itemID).single();
    if (error || !data) {
        notFound();
    }
    return (
    <main style={{ maxWidth: "1200px",margin: "0 auto", padding: "1rem", fontFamily: "Arial" }}>
        <div style={{ justifyContent: "space-between", display: "flex", alignItems: "center", marginBottom: "1rem" }}>
                <Link href="/" style={{ color: "white" }}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" width="28" height="28">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
                    </svg>
                </Link>
                    <div style={{ display: "flex", gap: "1rem" }}>
                <button style={{ padding: "0.5rem 1rem", backgroundColor: "#0070f3", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}>
                    Edit
                </button>
                <button style={{ padding: "0.5rem 1rem", backgroundColor: "#0070f3", color: "white", border: "none", borderRadius: "4px", cursor: "pointer" }}>
                    Add
                </button>
                </div>

            </div>

            <h2 style={{ textAlign: "center" }}><em>{data.item_name}</em></h2>


        <div style={{ maxWidth: "600px", margin: "0 auto", border: "1px solid #ccc", borderRadius: "8px", padding: "1rem", backgroundColor: "#f9f9f9" , color: "#333"}}>
            <p><strong>Description:</strong> {data.description}</p>
            <p><strong>Type:</strong> {data.item_type}</p>
            <p><strong>Product Group:</strong> {data.product_group}</p>
            <p><strong>Location(s):</strong> {data.item_location?.map((l: any) => l.location_id).join(", ")}</p>
            <p><strong>Box Type:</strong> {data.item_location?.map((l: any) => l.location?.box_type).filter(Boolean).join(", ")}</p>
        </div>
    </main>
)
}
            
    