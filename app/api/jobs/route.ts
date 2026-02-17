import { NextResponse } from "next/server";
import { AzureBlobStorage } from "@vcmach/adk-notes-capture-server/azure-blob-storage";

const blobStorage = new AzureBlobStorage();

export async function GET() {
  try {
    const allJobs = await blobStorage.listJobSchemas();

    // Data from Azure is already in snake_case frontend format
    const jobs = allJobs.map((jobData) => {
      const metadata = {
        estimated_duration_minutes:
          jobData.estimated_duration_minutes ?? 0,

        urgency:
          jobData.urgency ?? "unknown",

        location_context:
          jobData.specific_location ??
          jobData.location_type ??
          "Unknown location",

        job_category:
          jobData.category ?? "Uncategorized",

        problem_type:
          jobData.issue_type ?? "Unknown",

        complexity:
          jobData.complexity ?? "Unknown",

        communication_preference: "none",

        key_details:
          jobData.key_details ?? [],
      };

      return {
        id: jobData.job_id as string,
        title: (jobData.title as string) || "Untitled Job",
        summary: (jobData.description as string) || "",
        metadata,
        created_at: (jobData.created_at as string) || '1970-01-01',
        conversation_turns: 0,
      };
    });

    // SORT: Newest first
    jobs.sort(
      (a, b) =>
        new Date(b.created_at).getTime() -
        new Date(a.created_at).getTime()
    );

    return NextResponse.json({ jobs });
  } catch (error) {
    console.error("Error reading jobs:", error);
    return NextResponse.json({ jobs: [] }, { status: 500 });
  }
}
