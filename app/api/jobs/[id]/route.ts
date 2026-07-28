import { NextResponse } from "next/server";
import { getJobById } from "@/lib/jobsStore";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Reads from Azure when configured, otherwise from local conversation_data/
    const jobData = await getJobById(params.id);

    if (!jobData) {
      return NextResponse.json(
        { success: false, error: "Job not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      job: jobData,
      raw_json: JSON.stringify(jobData, null, 2), // Pretty formatted JSON
    });
  } catch (error) {
    console.error("Error fetching job:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch job" },
      { status: 500 }
    );
  }
}
