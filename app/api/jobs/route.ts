import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { listJobs } from "@/lib/jobsStore";

export async function GET() {
  try {
    // AUTH CHECK
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Reads from Azure when configured, otherwise from local conversation_data/
    const jobs = await listJobs();
    return NextResponse.json({ jobs });
  } catch (error) {
    console.error("Error reading jobs:", error);
    return NextResponse.json({ jobs: [] }, { status: 500 });
  }
}
