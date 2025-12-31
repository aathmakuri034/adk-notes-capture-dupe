import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const jobId = params.id;
    
    // Point to your conversation_data folder (adjust path if needed)
    const dataDir = path.join(process.cwd(), 'server', 'conversation_data');
    
    if (!fs.existsSync(dataDir)) {
      return NextResponse.json(
        { success: false, error: 'Data directory not found' },
        { status: 404 }
      );
    }
    
    // Find the file matching this job_id
    const files = fs.readdirSync(dataDir);
    
    for (const filename of files) {
      if (filename.startsWith('job_') && filename.endsWith('.json')) {
        const filepath = path.join(dataDir, filename);
        const content = fs.readFileSync(filepath, 'utf-8');
        const jobData = JSON.parse(content);
        
        if (jobData.job_id === jobId) {
          return NextResponse.json({ 
            success: true, 
            job: jobData,
            raw_json: JSON.stringify(jobData, null, 2) // Pretty formatted JSON
          });
        }
      }
    }
    
    return NextResponse.json(
      { success: false, error: 'Job not found' },
      { status: 404 }
    );
  } catch (error) {
    console.error('Error fetching job:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch job' },
      { status: 500 }
    );
  }
}