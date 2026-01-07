import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(req: NextRequest) {
  console.log("🔥 MIDDLEWARE HIT:", req.nextUrl.pathname);
  
  let response = NextResponse.next({
    request: {
      headers: req.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          req.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: req.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          req.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({ request: { headers: req.headers } });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const pathname = req.nextUrl.pathname;
  const isAuthPage = pathname === "/login" || pathname === "/signup";
  
  console.log("📍 Path:", pathname, "| Is Auth Page?", isAuthPage);

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
    console.log("👤 User:", user ? `✅ Authenticated` : "❌ NOT authenticated");
  } catch (error) {
    console.error("❌ Auth error:", error);
  }

  if (!user && !isAuthPage) {
    console.log("🚫 Redirecting to /login");
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (user && isAuthPage) {
    console.log("✅ Redirecting to homepage");
    return NextResponse.redirect(new URL("/", req.url));
  }

  console.log("✅ Allowing through");
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
