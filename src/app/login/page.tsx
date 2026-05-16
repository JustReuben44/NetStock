'use client';
import { createClient } from "@/lib/supabase-client";
const supabase = createClient();

export default function Login() {

  const handleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
        options: {
            redirectTo: `${window.location.origin}/search`
        }
    });
    if (error) {
      console.error("Error during login:", error);
    }

  };

  return (
    <main style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "80vh" }}>
      <h2 style={{ marginBottom: "1rem" }}>Welcome to Netstock</h2>
      <button onClick={handleLogin} style={{ padding: "0.5rem 1rem", fontSize: "1rem", borderRadius: "4px", border: "none", backgroundColor: "#0078D4", color: "#fff", cursor: "pointer" }}>
        Sign in with Microsoft
      </button>
    </main>
  );
}