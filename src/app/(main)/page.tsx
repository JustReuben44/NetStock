"use client";
import { createClient } from "@/lib/supabase-client";
import { useEffect, useState } from "react";
import "./page.css";
const supabase = createClient();

export default function SearchItems() {

  const [searchTerm, setSearchTerm] = useState({input: ""});
  const [items, setItems] = useState<any[]>([]);

  const retrieveItems = async() => {
    const { data, error } = await supabase.from("item").select("*");
    if (error) {
      console.error("Error retrieving items:", error);
      return;
    }
    setItems(data);
  };

  {/*Handle input change */}

  const handleSubmit = async(e: any) => {
    e.preventDefault();
    const { data, error } = await supabase
  .from("item")
  .select("*")
  .or(`itemname.ilike.%${searchTerm.input}%,itemtype.ilike.%${searchTerm.input}%,locationid.ilike.%${searchTerm.input}%`);
;

    if (error) {
      console.log("Error searching items:", error);
      return;
    }
    setItems(data);
  };

  useEffect(() => {
    retrieveItems();
  }, []);

  console.log(items);

  return(
    <main>
      <div style = {{maxWidth: "1000px", margin: "0 auto", padding: "1rem", fontFamily: "Arial"}}>
        <h2 style = {{textAlign: "center"}}><em>Search Stock</em></h2>

        <form onSubmit={handleSubmit} style = {{display: "flex", justifyContent: "center", marginBottom: "2rem"}}>
          <input 
          type="text" placeholder="e.g fibre cables" 
          style = {{padding: "0.5rem", fontSize: "1rem", width: "300px", borderRadius: "4px", border: "1px solid #ccc"}} 
          
          value={searchTerm.input}
          onChange={(e) => setSearchTerm({...searchTerm, input: e.target.value})}
          />
        </form>

        <button id="myBtn">Open Modal</button>
          <div id="myModal" className="modal">
            <div className="modal-content">
              <span className="close">&times;</span>
              <p>Some text in the Modal..</p>
            </div>

          </div>
      </div>

      <ul style = {{maxWidth: "1000px", margin: "0 auto", padding: "1rem", fontFamily: "Arial", listStyle: "none"}}>
        {items.map((item, key) => (
          <li 
          key={key} style = {{borderBottom: "1px solid #ccc", padding: "1rem 0"}}
          >
      
          <div style = {{display: "flex", justifyContent: "space-between"}}>
            <h4 style = {{margin: "0 0 0.5rem 0"}}>{item.itemname}</h4>
            <div style = {{display: "flex", gap: "1rem"}}>
              <button className = "itemButton">View</button>
              <button className = "itemButton">Add</button>
            </div>
          </div>
          </li>
        ))}
      </ul>

    </main>  );
}