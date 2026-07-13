import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export async function GET() {
  // SUPABASE-DISABLED-DEMO: logout no longer hits Supabase or clears sb-* cookies.
  // The route now just redirects to "/" since the login page is also disabled.
  // Original implementation preserved below.
  return NextResponse.redirect(new URL("/", "http://localhost:3000"));

  /* SUPABASE-DISABLED-DEMO
  const supabase = await createSupabaseServerClient();  // ← Add await here

  // Supabase side logout
  await supabase.auth.signOut();

  // Prepare the response
  const response = NextResponse.redirect(new URL("/login", "http://localhost:3000"));

  // Delete Supabase cookies properly
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();
  allCookies.forEach((cookie) => {
    if (cookie.name.startsWith('sb-')) {
      response.cookies.set(cookie.name, "", { maxAge: 0 });
    }
  });

  return response;
  */
}
