import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    await supabase.auth.exchangeCodeForSession(code);

    const { data: { user } } = await supabase.auth.getUser();

    if (!user?.email) {
      return NextResponse.redirect(new URL("/login?error=unauthorized", request.url));
    }

    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("email_address", user.email)
      .single();

    if (!existingUser) {
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL("/login?error=unauthorized", request.url));
    }
  }

  return NextResponse.redirect(new URL("/", request.url));
}
