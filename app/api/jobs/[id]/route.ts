import { NextResponse } from 'next/server';
import { AzureBlobStorage } from '@vcmach/adk-notes-capture-server/azure-blob-storage';

const blobStorage = new AzureBlobStorage();

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const jobId = params.id;

    const jobData = await blobStorage.getJobSchemaById(jobId);

    if (!jobData) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      job: jobData,
      raw_json: JSON.stringify(jobData, null, 2)
    });
  } catch (error) {
    console.error('Error fetching job:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch job' },
      { status: 500 }
    );
  }
}
