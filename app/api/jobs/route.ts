import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export async function GET() {
  try {
    // AUTH CHECK
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // READ JOB FILES
    const dataDir = path.join(process.cwd(), "server", "conversation_data");

    if (!fs.existsSync(dataDir)) {
      return NextResponse.json({ jobs: [] });
    }

    const files = fs.readdirSync(dataDir);
    const jobs: any[] = [];

    for (const filename of files) {
      if (filename.startsWith("job_") && filename.endsWith(".json")) {
        const filepath = path.join(dataDir, filename);
        const fileContent = fs.readFileSync(filepath, "utf-8");

        try {
          const jobData = JSON.parse(fileContent);

          // ⭐ NORMALIZE METADATA FOR FRONTEND
          const metadata = {
            estimated_duration_minutes:
              jobData.estimated_duration_minutes ??
              jobData.duration ??
              0,

            urgency:
              jobData.urgency ??
              jobData.priority ??
              "unknown",

            location_context:
              jobData.specific_location ??
              jobData.location ??
              jobData.location_type ??
              "Unknown location",

            job_category:
              jobData.job_category ??
              jobData.type ??
              jobData.category ??
              "Uncategorized",

            problem_type:
              jobData.problem_type ??
              jobData.issue_type ??
              "Unknown",

            complexity:
              jobData.complexity ??
              jobData.difficulty ??
              "Unknown",

            communication_preference:
              jobData.communication_preference ??
              "none",

            key_details:
              jobData.key_details ??
              jobData.details ??
              [],
          };

          jobs.push({
            id: jobData.job_id || jobData.id,
            title: jobData.title || "Untitled Job",
            summary: jobData.description || jobData.summary || "",
            metadata,
            created_at: jobData.created_at || jobData.timestamp || null,
            conversation_turns: 0,
          });
        } catch (e) {
          console.error("Failed to parse file:", filename, e);
        }
      }
    }

    // SORT: Newest first
    jobs.sort(
      (a, b) =>
        new Date(b.created_at || 0).getTime() -
        new Date(a.created_at || 0).getTime()
    );

    return NextResponse.json({ jobs });
  } catch (error) {
    console.error("Error reading jobs:", error);
    return NextResponse.json({ jobs: [] }, { status: 500 });
  }
}
