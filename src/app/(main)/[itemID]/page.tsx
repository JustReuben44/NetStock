import '../../globals.css'; 
import { createClient } from "@/lib/supabase-server";

export default async function ItemDetails({ params }: { params: { itemID: string } }) {
    const supabase = await createClient();
    const { itemID } = await params
    const { data, error } = await supabase.from("item").select("*").eq("itemid", itemID).single();
    if (error) {
        console.error("Error retrieving item details:", error);
        return null;
    }return (
    <main style={{ maxWidth: "600px", margin: "0 auto", padding: "1rem", fontFamily: "Arial" }}>
        <h2 style={{ textAlign: "center" }}><em>{data.itemname}</em></h2>
        <div style={{ border: "1px solid #ccc", borderRadius: "8px", padding: "1rem", backgroundColor: "#f9f9f9" , color: "#333"}}>
            <p><strong>Description:</strong> {data.description}</p>
            <p><strong>Type:</strong> {data.itemtype}</p>
            <p><strong>Location:</strong> {data.locationid}</p>
            </div>
    </main>
)
}
            
    