import { NextResponse } from 'next/server';
import { BlobServiceClient } from "@azure/storage-blob";

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

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const jobId = params.id;

    // Get container client
    const containerClient = getBlobContainerClient();

    // Search through all job schema blobs for matching job_id
    for await (const blob of containerClient.listBlobsFlat({ prefix: "job-schemas/" })) {
      if (blob.name.endsWith('.json')) {
        try {
          const blobClient = containerClient.getBlobClient(blob.name);
          const downloadResponse = await blobClient.download();
          const content = await streamToString(downloadResponse.readableStreamBody);
          const jobData = JSON.parse(content);

          if (jobData.job_id === jobId) {
            return NextResponse.json({
              success: true,
              job: jobData,
              raw_json: JSON.stringify(jobData, null, 2) // Pretty formatted JSON
            });
          }
        } catch (parseError) {
          console.error('Error parsing blob:', blob.name, parseError);
          continue;
        }
      }
    }

    return NextResponse.json(
      { success: false, error: 'Job not found' },
      { status: 404 }
    );
  } catch (error) {
    console.error('Error fetching job from Azure Blob:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch job' },
      { status: 500 }
    );
  }
}
