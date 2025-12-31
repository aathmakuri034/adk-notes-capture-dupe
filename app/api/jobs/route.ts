import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    // Updated path to point to server/conversation_data
    const dataDir = path.join(process.cwd(), 'server', 'conversation_data');
    
    if (!fs.existsSync(dataDir)) {
      console.log('Data directory not found:', dataDir);
      return NextResponse.json({ jobs: [] });
    }

    const files = fs.readdirSync(dataDir);
    const jobs = [];

    for (const filename of files) {
      if (filename.startsWith('job_') && filename.endsWith('.json')) {
        const filepath = path.join(dataDir, filename);
        try {
          const content = fs.readFileSync(filepath, 'utf-8');
          const jobData = JSON.parse(content);
          
          // Map the Python schema to your frontend interface
          jobs.push({
            id: jobData.job_id || jobData.id, // Use job_id from schema
            title: jobData.title,
            summary: jobData.description,
            metadata: {
              estimated_duration_minutes: jobData.estimated_duration_minutes || 0,
              urgency: jobData.urgency || 'medium',
              location_context: jobData.specific_location || 'Not specified',
              job_category: jobData.category || 'general',
              problem_type: jobData.problem_type || 'General repair',
              complexity: jobData.complexity || 'intermediate',
              communication_preference: 'phone', // Default value
              key_details: jobData.key_details || []
            },
            created_at: jobData.created_at,
            conversation_turns: 0 // Default value
          });
        } catch (error) {
          console.error(`Error parsing job file ${filename}:`, error);
        }
      }
    }

    // Sort by created_at timestamp (newest first)
    jobs.sort((a, b) => {
      const dateA = new Date(a.created_at || 0).getTime();
      const dateB = new Date(b.created_at || 0).getTime();
      return dateB - dateA;
    });

    return NextResponse.json({ jobs });
  } catch (error) {
    console.error('Error reading jobs:', error);
    return NextResponse.json({ jobs: [] }, { status: 500 });
  }
}