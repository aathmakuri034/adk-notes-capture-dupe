import { createBrowserClient } from "@supabase/ssr";

export const supabaseClient = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      persistSession: false,  // Don't persist across browser sessions
      autoRefreshToken: false,  // Don't auto-refresh tokens
      detectSessionInUrl: true
    }
  }
);
