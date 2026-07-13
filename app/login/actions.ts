"use server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { revalidatePath } from "next/cache";

export async function loginAction(prevState: any, formData: FormData) {
  // SUPABASE-DISABLED-DEMO: Supabase password auth is disabled for the demo.
  // The action now returns success immediately without contacting Supabase.
  // Original implementation preserved below.
  return { error: "", success: true };

  /* SUPABASE-DISABLED-DEMO
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message, success: false };
  }

  // Revalidate to clear cache
  revalidatePath('/', 'layout');

  // Return success flag for client-side redirect
  return { error: "", success: true };
  */
}
