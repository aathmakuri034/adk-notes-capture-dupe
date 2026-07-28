import { BlobServiceClient } from "@azure/storage-blob";
import fs from "fs";
import path from "path";

// Local directory the Python server writes job schema JSON files to.
const LOCAL_JOBS_DIR = path.join(process.cwd(), "server", "conversation_data");

// Azure is used only when a connection string is configured; otherwise we fall
// back to reading the job schema JSON files off local disk.
function azureConfigured(): boolean {
  return Boolean(process.env.AZURE_STORAGE_CONNECTION_STRING);
}

function getBlobContainerClient() {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING as string;
  const containerName = process.env.AZURE_CONTAINER_NAME || "extracted-data";
  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  return blobServiceClient.getContainerClient(containerName);
}

// Convert a readable stream to a UTF-8 string.
function streamToString(readableStream: NodeJS.ReadableStream | undefined): Promise<string> {
  if (!readableStream) {
    return Promise.resolve("");
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    readableStream.on("data", (data) => {
      chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
    });
    readableStream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    readableStream.on("error", reject);
  });
}

export interface JobListItem {
  id: string;
  title: string;
  summary: string;
  metadata: Record<string, unknown>;
  created_at: string | null;
  conversation_turns: number;
}

// Normalize a raw job schema object into the list item the frontend expects.
function toListItem(jobData: any): JobListItem {
  const metadata = {
    estimated_duration_minutes:
      jobData.estimated_duration_minutes ?? jobData.duration ?? 0,
    urgency: jobData.urgency ?? jobData.priority ?? "unknown",
    location_context:
      jobData.specific_location ??
      jobData.location ??
      jobData.location_type ??
      "Unknown location",
    job_category:
      jobData.job_category ?? jobData.type ?? jobData.category ?? "Uncategorized",
    problem_type: jobData.problem_type ?? jobData.issue_type ?? "Unknown",
    complexity: jobData.complexity ?? jobData.difficulty ?? "Unknown",
    communication_preference: jobData.communication_preference ?? "none",
    key_details: jobData.key_details ?? jobData.details ?? [],
  };
  return {
    id: jobData.job_id || jobData.id,
    title: jobData.title || "Untitled Job",
    summary: jobData.description || jobData.summary || "",
    metadata,
    created_at: jobData.created_at || jobData.timestamp || null,
    conversation_turns: 0,
  };
}

function sortNewestFirst(jobs: JobListItem[]): JobListItem[] {
  return jobs.sort(
    (a, b) =>
      new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  );
}

// Read every job schema, from Azure when configured, otherwise from local disk.
export async function listJobs(): Promise<JobListItem[]> {
  const jobs: JobListItem[] = [];

  if (azureConfigured()) {
    const containerClient = getBlobContainerClient();
    for await (const blob of containerClient.listBlobsFlat({ prefix: "job-schemas/" })) {
      if (!blob.name.endsWith(".json")) continue;
      try {
        const blobClient = containerClient.getBlobClient(blob.name);
        const res = await blobClient.download();
        jobs.push(toListItem(JSON.parse(await streamToString(res.readableStreamBody))));
      } catch (e) {
        console.error("Failed to parse blob:", blob.name, e);
      }
    }
    return sortNewestFirst(jobs);
  }

  if (!fs.existsSync(LOCAL_JOBS_DIR)) return jobs;
  for (const filename of fs.readdirSync(LOCAL_JOBS_DIR)) {
    if (!filename.startsWith("job_") || !filename.endsWith(".json")) continue;
    try {
      const content = fs.readFileSync(path.join(LOCAL_JOBS_DIR, filename), "utf-8");
      jobs.push(toListItem(JSON.parse(content)));
    } catch (e) {
      console.error("Failed to parse job file:", filename, e);
    }
  }
  return sortNewestFirst(jobs);
}

// Read a single raw job schema by job_id, from Azure when configured, else local.
export async function getJobById(jobId: string): Promise<any | null> {
  if (azureConfigured()) {
    const containerClient = getBlobContainerClient();
    for await (const blob of containerClient.listBlobsFlat({ prefix: "job-schemas/" })) {
      if (!blob.name.endsWith(".json")) continue;
      try {
        const blobClient = containerClient.getBlobClient(blob.name);
        const res = await blobClient.download();
        const jobData = JSON.parse(await streamToString(res.readableStreamBody));
        if (jobData.job_id === jobId) return jobData;
      } catch (e) {
        console.error("Error parsing blob:", blob.name, e);
      }
    }
    return null;
  }

  if (!fs.existsSync(LOCAL_JOBS_DIR)) return null;
  for (const filename of fs.readdirSync(LOCAL_JOBS_DIR)) {
    if (!filename.startsWith("job_") || !filename.endsWith(".json")) continue;
    try {
      const content = fs.readFileSync(path.join(LOCAL_JOBS_DIR, filename), "utf-8");
      const jobData = JSON.parse(content);
      if (jobData.job_id === jobId) return jobData;
    } catch (e) {
      console.error("Error parsing job file:", filename, e);
    }
  }
  return null;
}
