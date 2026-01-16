import { NextResponse } from "next/server";
import { BlobServiceClient } from "@azure/storage-blob";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

// Initialize Azure Blob Storage client
function getBlobContainerClient() {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error("AZURE_STORAGE_CONNECTION_STRING not configured");
  }

  const containerName = process.env.AZURE_CONTAINER_NAME || "extracted-data";
  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  return blobServiceClient.getContainerClient(containerName);
}

export async function GET() {
  try {
    // AUTH CHECK
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // FETCH JOBS FROM AZURE BLOB STORAGE
    const containerClient = getBlobContainerClient();
    const jobs: any[] = [];

    // List all blobs in job-schemas/ directory
    for await (const blob of containerClient.listBlobsFlat({ prefix: "job-schemas/" })) {
      if (blob.name.endsWith(".json")) {
        try {
          // Download and parse the blob
          const blobClient = containerClient.getBlobClient(blob.name);
          const downloadResponse = await blobClient.download();
          const blobContent = await streamToString(downloadResponse.readableStreamBody);
          const jobData = JSON.parse(blobContent);

          // NORMALIZE METADATA FOR FRONTEND
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
          console.error("Failed to parse blob:", blob.name, e);
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
    console.error("Error reading jobs from Azure Blob:", error);
    return NextResponse.json({ jobs: [] }, { status: 500 });
  }
}

// Helper function to convert readable stream to string
async function streamToString(readableStream: NodeJS.ReadableStream | undefined): Promise<string> {
  if (!readableStream) {
    return "";
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    readableStream.on("data", (data) => {
      chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
    });
    readableStream.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf-8"));
    });
    readableStream.on("error", reject);
  });
}
