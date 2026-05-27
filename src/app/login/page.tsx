'use client';
import { createClient } from "@/lib/supabase-client";
import "./page.css";
import "../globals.css";
const supabase = createClient();

export default function Login() {

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
        options: {
            redirectTo: `${window.location.origin}/auth/callback`, 
            scopes: 'openid profile email',
        }
    });
    if (error) {
      console.error("Error during login:", error);
    }

  };

  return (
    <main style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "80vh" }}>
      <h1 style={{ marginBottom: "1rem" , fontFamily: "Brand",}}>
        <span className="brand"> // </span> Sign In
      </h1>
      <button onClick={handleLogin} style={{ padding: "0.5rem 1rem", fontSize: "1rem", borderRadius: "4px", border: "none", backgroundColor: "#0078D4", color: "#fff", cursor: "pointer" , justifyContent: "center", display: "flex", alignItems: "center", gap: "0.5rem"}}>
    <svg xmlns="http://www.w3.org/2000/svg" x="0px" y="0px" width="28" height="28" viewBox="0 0 48 48">
<path fill="#ff5722" d="M6 6H22V22H6z" transform="rotate(-180 14 14)"></path><path fill="#4caf50" d="M26 6H42V22H26z" transform="rotate(-180 34 14)"></path><path fill="#ffc107" d="M26 26H42V42H26z" transform="rotate(-180 34 34)"></path><path fill="#03a9f4" d="M6 26H22V42H6z" transform="rotate(-180 14 34)"></path>
</svg>
        Sign in with Microsoft
      </button>
    </main>
  );
}