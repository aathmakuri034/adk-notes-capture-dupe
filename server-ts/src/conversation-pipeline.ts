/**
 * Job Extraction Pipeline using Vertex AI
 *
 * Extracts structured job data from conversation text using Gemini.
 * Validates against TypeScript schema and saves to JSON files.
 */

import { GoogleAuth } from 'google-auth-library';
import * as fs from 'fs';
import * as path from 'path';
import { config, logger } from './config.js';
import {
  Job,
  JobCategory,
  UrgencyLevel,
  LocationType,
  ComplexityLevel,
  PaintingSubJobType,
  ElectricalSubJobType,
  PlumbingSubJobType,
  HVACSubJobType,
  GeneralSubJobType,
  validateJob,
  generateJobId,
} from './schema.js';
import { getAzureBlobStorage } from './azure-blob-storage-singleton.js';

// Store job data in the consumer's project root, not inside node_modules.
const OUTPUT_DIR = path.join(process.cwd(), 'conversation_data');

let _outputDirReady = false;
async function ensureOutputDir(): Promise<void> {
  if (_outputDirReady) return;
  await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });
  _outputDirReady = true;
}

/**
 * Get Vertex AI access token for authentication
 */
async function getAccessToken(): Promise<string> {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  if (!tokenResponse.token) {
    throw new Error('Failed to get access token');
  }
  return tokenResponse.token;
}

/**
 * Call Vertex AI Gemini API
 */
async function callVertexAI(prompt: string): Promise<string> {
  const accessToken = await getAccessToken();
  const endpoint = `https://${config.LOCATION}-aiplatform.googleapis.com/v1/projects/${config.PROJECT_ID}/locations/${config.LOCATION}/publishers/google/models/${config.EXTRACTION_MODEL}:generateContent`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: [{ text: prompt }],
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Vertex AI API error: ${error}`);
  }

  const data = await response.json() as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/**
 * Safely parse JSON from LLM response
 */
function safeJsonParse(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw);
  } catch {
    // Try to extract JSON from markdown code blocks
    try {
      let cleaned = raw;
      if (raw.includes('```json')) {
        cleaned = raw.split('```json')[1].split('```')[0].trim();
      } else if (raw.includes('```')) {
        cleaned = raw.split('```')[1].split('```')[0].trim();
      }

      // Find JSON object boundaries
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}') + 1;
      if (start !== -1 && end > start) {
        cleaned = cleaned.slice(start, end);
        return JSON.parse(cleaned);
      }
    } catch (e) {
      logger.error('Failed to parse JSON:', e);
      logger.error('Raw response:', raw);
    }
    return null;
  }
}

/**
 * Get subjob examples based on category
 */
function getSubjobExamples(category: string): string {
  const examples: Record<string, string> = {
    plumbing: `
Available sub_job_types: "Burst Pipe", "Drain Cleaning", "Water Heater", "Fixture Replacement", "Sewer Line"

BURST PIPE (Emergency):
{
  "category": "plumbing",
  "sub_job_type": "Burst Pipe",
  "urgency": "emergency",
  "pipe_location": "Basement/kitchen/etc",
  "pipe_type": "Copper/PVC/PEX/Galvanized",
  "water_shutoff": true/false,
  "flooding_extent": "Minor/moderate/severe"
}

DRAIN CLEANING:
{
  "category": "plumbing",
  "sub_job_type": "Drain Cleaning",
  "drain_location": "Kitchen/bathroom/shower",
  "clog_severity": "Completely blocked/slow draining",
  "recurring_issue": true/false
}

WATER HEATER:
{
  "category": "plumbing",
  "sub_job_type": "Water Heater",
  "heater_type": "Tank/Tankless",
  "heater_age": 5,
  "fuel_type": "Gas/Electric",
  "heater_issue_description": "No hot water/leaking/noises"
}

FIXTURE REPLACEMENT:
{
  "category": "plumbing",
  "sub_job_type": "Fixture Replacement",
  "fixture_to_replace": "Sink/Toilet/Faucet/Shower/etc.",
  "new_fixture_provided": true/false,
  "fixture_model": "Brand and model if known",
  "reason_for_replacement": "Broken/leaking/upgrade/etc"
}

SEWER LINE:
{
  "category": "plumbing",
  "sub_job_type": "Sewer Line",
  "complexity": "complex",
  "sewer_issue_type": "Backup/blockage/damage/root intrusion",
  "sewage_backup_location": "Where sewage is backed up?",
  "camera_inspection_needed": true/false,
  "property_access": "Yard/driveway/Under House/etc"
}`,

    electrical: `
Available sub_job_types: "Outlet Repair", "Wiring Problems", "Code Compliance", "Lighting Systems", "Ceiling Fans"

OUTLET REPAIR:
{
  "category": "electrical",
  "sub_job_type": "Outlet Repair",
  "outlet_issue": "Not working/sparking/loose/burned",
  "outlet_location": "Kitchen/bedroom/garage",
  "outlet_type_needed": "Standard/GFCI/USB",
  "outlets_affected": 1
}

CEILING FANS:
{
  "category": "electrical",
  "sub_job_type": "Ceiling Fans",
  "number_of_fans": 2,
  "fan_locations": ["Bedroom", "Living room"],
  "existing_wiring": true/false,
  "fan_provided": true/false
}

WIRING PROBLEMS:
{
  "category": "electrical",
  "sub_job_type": "Wiring Problems",
  "wiring_issue": "Flickering Lights/dead outlets/buzzing/etc.",
  "affected_circuits": ["Room1", "Room2"],
  "visible_damage": true/false,
  "safety_concern": true/false
}

CODE COMPLIANCE:
{
  "category": "electrical",
  "sub_job_type": "Code Compliance",
  "compliance_reason": "Home sale/inspection/insurance/renovation/etc",
  "violations_identified": ["Violation 1", "Violation 2"],
  "inspection_report_available": true/false
}

LIGHTING SYSTEMS:
{
  "category": "electrical",
  "sub_job_type": "Lighting Systems",
  "lighting_type": "Recessed/pendant/chandelier/landscape/etc",
  "number_of_fixtures": 3,
  "rooms_for_lighting": ["Living room", "Kitchen"],
  "dimmer_switches": true/false
}`,

    hvac: `
Available sub_job_types: "AC Installation/Repair", "Refrigerant Recharging", "Duct Cleaning and Sealing", "Humidifier", "Filter Replacement"

AC INSTALLATION/REPAIR:
{
  "category": "hvac",
  "sub_job_type": "AC Installation/Repair",
  "service_type": "Installation/repair/replacement",
  "ac_issue": "Not cooling/not turning on/noisy",
  "system_tonnage": "2.5 ton",
  "outdoor_unit_running": true/false
}

FILTER REPLACEMENT:
{
  "category": "hvac",
  "sub_job_type": "Filter Replacement",
  "complexity": "basic",
  "filter_type_needed": "Standard/HEPA/electrostatic",
  "filter_size": "16x25x1"
}

REFRIGERANT RECHARGING:
{
  "category": "hvac",
  "sub_job_type": "Refrigerant Recharging",
  "refrigerant_type": "R-22/R-410A/etc",
  "suspected_leak": true/false,
  "cooling_performance": "Not cooling/weak cooling/etc"
}

DUCT CLEANING AND SEALING:
{
  "category": "hvac",
  "sub_job_type": "Duct Cleaning and Sealing",
  "last_cleaning": "2 years ago/never/unknown",
  "visible_mold": true/false,
  "airflow_issues": true/false,
  "sealing_needed": true/false
}

HUMIDIFIER:
{
  "category": "hvac",
  "sub_job_type": "Humidifier",
  "humidifier_type": "Whole house/portable/steam/bypass/etc",
  "install_or_repair": "New installation/repair existing",
  "humidity_issues": "Dry skin/static/wood cracking/etc"
}`,

    painting: `
Available sub_job_types: "Wall Ceiling Painting", "Cabinet Refinishing", "Wallpaper Services", "Exterior House Painting", "Deck Painting/Stain"

WALL CEILING PAINTING:
{
  "category": "painting",
  "sub_job_type": "Wall Ceiling Painting",
  "rooms_to_paint": ["Living room", "Bedroom"],
  "paint_ceilings": true/false,
  "paint_trim": true/false,
  "number_of_rooms": 1,
  "ceiling_height": 8.0,
  "paint_colors": ["white", "blue"]
}

CABINET REFINISHING:
{
  "category": "painting",
  "sub_job_type": "Cabinet Refinishing",
  "cabinet_location": "Kitchen/bathroom/laundry/etc",
  "number_of_cabinets": 12,
  "finish_type": "Paint/stain/refinish",
  "hardware_replacement": true/false
}

WALLPAPER SERVICES:
{
  "category": "painting",
  "sub_job_type": "Wallpaper Services",
  "service_type": "Installation/removal/both",
  "rooms_for_wallpaper": ["Dining room"],
  "wallpaper_provided": true/false,
  "walls_to_cover": 4
}

EXTERIOR HOUSE PAINTING:
{
  "category": "painting",
  "sub_job_type": "Exterior House Painting",
  "location_type": "outdoor",
  "house_stories": 2,
  "siding_type": "Wood/vinyl/brick/stucco/etc",
  "approximate_square_feet": 2000,
  "trim_included": true/false
}

DECK PAINTING/STAIN:
{
  "category": "painting",
  "sub_job_type": "Deck Painting/Stain",
  "location_type": "outdoor",
  "deck_size": "12x20 ft",
  "finish_type": "Paint/stain/seal",
  "deck_material": "Cedar/composite/pressure-treated/etc",
  "railings_included": true/false
}`,

    general: `
Available sub_job_types: "Inspections", "Permit Procurement", "Home Additions", "Disaster Recovery"

INSPECTIONS:
{
  "category": "general",
  "sub_job_type": "Inspections",
  "inspection_type": "Pre-purchase/maintenance/insurance",
  "property_age": 20,
  "specific_concerns": ["Foundation", "Roof"]
}

PERMIT PROCUREMENT:
{
  "category": "general",
  "sub_job_type": "Permit Procurement",
  "permit_type": "Building/electrical/plumbing/etc",
  "project_description": "Description of project needing permit",
  "jurisdiction": "City and county"
}

HOME ADDITIONS (Complex):
{
  "category": "general",
  "sub_job_type": "Home Additions",
  "complexity": "complex",
  "addition_type": "Room/second story/sunroom/garage/etc",
  "approximate_square_feet": 300,
  "foundation_needed": true/false
}

DISASTER RECOVERY:
{
  "category": "general",
  "sub_job_type": "Disaster Recovery",
  "urgency": "high" or "emergency",
  "disaster_type": "Fire/flood/storm",
  "extent_of_damage": "Minor/moderate/severe",
  "insurance_claim": true/false
}`,
  };

  return examples[category] || '';
}

/**
 * Get category-specific base fields
 */
function getCategoryBaseFields(category: string): string {
  const categoryFields: Record<string, string> = {
    plumbing: `
PLUMBING-SPECIFIC BASE FIELDS (include when available):
- "issue_type": "leak/clog/installation/repair/etc"
- "fixture_type": "sink/toilet/shower/bathtub/etc"
- "severity": "minor/moderate/severe"
- "water_damage": true/false
- "water_shut_off": true/false
- "access_difficulty": "easy/moderate/difficult"
- "age_of_plumbing": "approximate age or unknown"`,

    electrical: `
ELECTRICAL-SPECIFIC BASE FIELDS (include when available):
- "installation_type": "outlet/panel/lighting/wiring/etc"
- "number_of_outlets": <number>
- "voltage_requirement": "120V/240V/etc"
- "amperage": <number>
- "has_existing_panel": true/false
- "panel_capacity": "100A/200A/etc"
- "desired_location": "Specific location description"
- "current_wiring": "Description of existing wiring"
- "permits_required": true/false`,

    hvac: `
HVAC-SPECIFIC BASE FIELDS (include when available):
- "system_type": "AC/heater/heat pump/etc"
- "issue_type": "no cooling/no heating/noise/etc"
- "system_age": <number in years>
- "last_service_date": "date or 'unknown'"
- "brand_model": "Brand and model if known"
- "square_footage": <number>
- "filter_change_frequency": "monthly/quarterly/etc"
- "thermostat_type": "manual/programmable/smart"`,

    painting: `
PAINTING-SPECIFIC BASE FIELDS (include when available):
- "number_of_rooms": <number>
- "ceiling_height": <number in feet>
- "room_size": "Dimensions (e.g., 12x15 ft)"
- "number_of_walls": <number>
- "number_of_doors": <number>
- "number_of_windows": <number>
- "paint_colors": ["color1", "color2"]
- "surface_condition": "good/fair/needs repair"
- "prep_work_needed": "patching/sanding/priming/etc"`,

    general: `
GENERAL-SPECIFIC BASE FIELDS (include when available):
- "work_type": "Type of general work needed"
- "materials_needed": ["material1", "material2"]
- "estimated_scope": "Brief scope description"
- "special_requirements": "Any special requirements"`,
  };

  return categoryFields[category] || '';
}

/**
 * JobExtractor class - extracts structured job data using Vertex AI
 */
export class JobExtractor {
  private _lockChain: Promise<void> = Promise.resolve();

  private withLock<T>(fn: () => Promise<T>): Promise<T> {
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const prev = this._lockChain;
    this._lockChain = gate;
    return prev.then(async () => {
      try {
        return await fn();
      } finally {
        release();
      }
    });
  }

  /**
   * Identify job category from text
   */
  private async identifyCategory(text: string): Promise<string> {
    const prompt = `Analyze this job description and identify ONLY the category.

JOB DESCRIPTION:
${text}

Return ONLY a JSON object with this format:
{
  "category": "plumbing" OR "electrical" OR "hvac" OR "painting" OR "general"
}

Choose the most appropriate category. Return ONLY the JSON, nothing else.`;

    try {
      const response = await callVertexAI(prompt);
      const data = safeJsonParse(response.trim());
      const category = ((data?.category as string) || 'general').toLowerCase();
      logger.info(`Identified category: ${category}`);
      return category;
    } catch (error) {
      logger.error('Error identifying category:', error);
      return 'general';
    }
  }

  /**
   * Build extraction prompt for the LLM
   */
  private buildExtractionPrompt(text: string, category: string): string {
    const subjobExamples = getSubjobExamples(category);
    const categoryBaseFields = getCategoryBaseFields(category);

    return `Analyze the following job description and extract ALL available information.

JOB DESCRIPTION:
${text}

REQUIRED BASE FIELDS (always include these):
{
  "category": "${category}",
  "title": "Brief descriptive title (3-8 words)",
  "description": "One sentence summary of the work needed",
  "location_type": "indoor" OR "outdoor" OR "both",
  "specific_location": "Room/area name",
  "urgency": "low" OR "medium" OR "high" OR "emergency",
  "complexity": "basic" OR "intermediate" OR "complex",
  "estimated_duration_minutes": <number>,
  "problem_type": "Brief problem category",
  "customer_notes": "Additional context (or null)",
  "tools_needed": "Tools required (or null)",
  "key_details": ["Important detail 1", "Important detail 2"],
  "has_images": false,
  "has_video": false
}

${categoryBaseFields}

SUBJOB TYPES AND SPECIFIC FIELDS:
${subjobExamples}

IMPORTANT RULES:
1. ALWAYS include ALL required base fields above
2. Include "sub_job_type" when you can identify the specific type
3. Fill in category-specific fields
4. Fill in subjob-specific fields when applicable
5. Use null for missing optional values
6. Estimate duration: basic=60-90min, intermediate=120-180min, complex=240+min
7. Create key_details array with 3-5 important points
8. Return ONLY valid JSON, no markdown code blocks`;
  }

  /**
   * Extract structured job data from text
   */
  async extractFromText(jobText: string): Promise<Job | null> {
    const category = await this.identifyCategory(jobText);
    const userPrompt = this.buildExtractionPrompt(jobText, category);

    const systemMessage = `You are a JSON extraction engine for home repair job intake.
You never greet users.
You never act conversationally.
You ONLY output structured JSON object that match the required schema.
Extract all relevant details from the job description.
Be precise and factual.
Never output markdown code blocks.`;

    try {
      const response = await callVertexAI(`${systemMessage}\n\n${userPrompt}`);
      logger.info(`Raw extraction response length: ${response.length} chars`);

      const jobData = safeJsonParse(response.trim());

      if (!jobData) {
        logger.warn('No valid JSON extracted');
        return null;
      }

      const job = validateJob(jobData);

      if (job) {
        logger.info(`Successfully extracted ${job.category} job: ${job.title}`);
      }

      return job;
    } catch (error) {
      logger.error('Error extracting job data:', error);
      return null;
    }
  }

  /**
   * Check if a job file with similar title exists
   */
  private async jobFileExists(title: string): Promise<boolean> {
    const titleLower = title.toLowerCase().trim();

    try {
      await fs.promises.access(OUTPUT_DIR);
    } catch {
      return false;
    }

    const files = await fs.promises.readdir(OUTPUT_DIR);
    for (const filename of files) {
      if (!filename.startsWith('job_') || !filename.endsWith('.json')) {
        continue;
      }

      try {
        const filepath = path.join(OUTPUT_DIR, filename);
        const content = await fs.promises.readFile(filepath, 'utf-8');
        const existingJob = JSON.parse(content);
        const existingTitle = (existingJob.title || '').toLowerCase().trim();

        // Check for exact match
        if (titleLower === existingTitle) {
          return true;
        }

        // Check for fuzzy match
        if (titleLower.length > 5 && (
          titleLower.includes(existingTitle) || existingTitle.includes(titleLower)
        )) {
          return true;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`Job file read error: ${message}`);
        continue;
      }
    }

    return false;
  }

  /**
   * Sanitize filename
   */
  private sanitizeFilename(title: string, jobId: string): string {
    const safeTitle = title
      .replace(/[^a-zA-Z0-9 \-_]/g, '_')
      .replace(/ /g, '_')
      .slice(0, 50);
    return `job_${jobId}_${safeTitle}.json`;
  }

  /**
   * Save job to individual file
   */
  async saveToFile(
    job: Job,
    sessionId: string,
    userId: string = 'anon'
  ): Promise<{ filepath: string | null; jobId?: string }> {
    if (!job) {
      logger.info('No job to save');
      return { filepath: null };
    }

    return this.withLock(async () => {
      await ensureOutputDir();

      // Check for duplicates
      if (await this.jobFileExists(job.title)) {
        logger.info(`Skipping duplicate job: '${job.title}'`);
        return { filepath: null };
      }

      // Generate unique job ID
      const jobId = generateJobId();
      const filename = this.sanitizeFilename(job.title, jobId);
      const filepath = path.join(OUTPUT_DIR, filename);

      // Add metadata
      const jobData = {
        ...job,
        jobId,
        sessionId,
        userId,
        lastUpdated: new Date().toISOString(),
      };

      // Save to file
      await fs.promises.writeFile(filepath, JSON.stringify(jobData, null, 2), 'utf-8');

      const subJobType = (job as unknown as Record<string, unknown>).sub_job_type || 'N/A';
      logger.info(`Saved job to: ${filepath} (sub_job_type: ${subJobType})`);

      return { filepath, jobId };
    });
  }

  /**
   * Get all jobs from files
   */
  async getAllJobs(): Promise<Record<string, unknown>[]> {
    const jobs: Record<string, unknown>[] = [];

    try {
      await fs.promises.access(OUTPUT_DIR);
    } catch {
      return jobs;
    }

    const files = await fs.promises.readdir(OUTPUT_DIR);
    for (const filename of files) {
      if (!filename.startsWith('job_') || !filename.endsWith('.json')) {
        continue;
      }

      try {
        const filepath = path.join(OUTPUT_DIR, filename);
        const content = await fs.promises.readFile(filepath, 'utf-8');
        jobs.push(JSON.parse(content));
      } catch (error) {
        logger.error(`Error reading job file ${filename}:`, error);
      }
    }

    // Sort by created_at (newest first)
    jobs.sort((a, b) => {
      const aDate = (a.createdAt as string) || '';
      const bDate = (b.createdAt as string) || '';
      return bDate.localeCompare(aDate);
    });

    return jobs;
  }

  /**
   * Get a specific job by ID
   */
  async getJobById(jobId: string): Promise<Record<string, unknown> | null> {
    try {
      await fs.promises.access(OUTPUT_DIR);
    } catch {
      return null;
    }

    const files = await fs.promises.readdir(OUTPUT_DIR);
    for (const filename of files) {
      if (!filename.startsWith('job_') || !filename.endsWith('.json')) {
        continue;
      }

      try {
        const filepath = path.join(OUTPUT_DIR, filename);
        const content = await fs.promises.readFile(filepath, 'utf-8');
        const job = JSON.parse(content);
        if (job.jobId === jobId || job.job_id === jobId) {
          return job;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  /**
   * Delete a job by ID
   */
  async deleteJob(jobId: string): Promise<boolean> {
    try {
      await fs.promises.access(OUTPUT_DIR);
    } catch {
      return false;
    }

    const files = await fs.promises.readdir(OUTPUT_DIR);
    for (const filename of files) {
      if (!filename.startsWith('job_') || !filename.endsWith('.json')) {
        continue;
      }

      try {
        const filepath = path.join(OUTPUT_DIR, filename);
        const content = await fs.promises.readFile(filepath, 'utf-8');
        const job = JSON.parse(content);
        if (job.jobId === jobId || job.job_id === jobId || job.id === jobId) {
          await fs.promises.unlink(filepath);
          logger.info(`Deleted job file: ${filepath}`);
          return true;
        }
      } catch {
        continue;
      }
    }

    return false;
  }
}

/**
 * JobSummaryTracker - tracks job summaries and extracts structured data
 */
export class JobSummaryTracker {
  private extractor: JobExtractor;

  constructor() {
    this.extractor = new JobExtractor();
  }

  /**
   * Extract and save job from note data
   */
  async extractAndSaveFromNote(
    sessionId: string,
    title: string,
    description: string,
    details: string[],
    userId: string = 'anon',
    videoAnalyses: string[] = []
  ): Promise<{ filepath: string | null; jobId?: string }> {
    try {
      // Build job text from note components
      let jobText = `
Title: ${title}

Description: ${description}

Key Details:
${details.map(d => `- ${d}`).join('\n')}
`;

      // If video analysis exists, append it
      if (videoAnalyses.length > 0) {
        jobText += `\n\nVideo Analysis:\n${videoAnalyses.map((analysis, idx) => `Video ${idx + 1}:\n${analysis}`).join('\n\n')}`;
      }

      logger.info(`Extracting structured data for: ${title}`);

      // Extract structured data
      const job = await this.extractor.extractFromText(jobText);

      if (!job) {
        logger.warn(`No job extracted from note: ${title}`);
        return { filepath: null };
      }

      // Save to JSON
      const { filepath, jobId } = await this.extractor.saveToFile(job, sessionId, userId);

      if (filepath) {
        logger.info(`Successfully saved job to: ${filepath}`);

        // Upload to Azure Blob Storage
        const azure = getAzureBlobStorage();
        await azure.waitForInit();
        if (azure.isInitialized()) {
          try {
            // Get the job data with metadata
            const jobData = {
              ...job,
              jobId: jobId || generateJobId(),
              sessionId,
              userId,
              lastUpdated: new Date().toISOString(),
            };

            // Upload to Azure
            const blobPath = await azure.uploadJobSchema(
              jobData,
              `${sessionId}_${jobId}`
            );

            if (blobPath) {
              logger.info(`Successfully uploaded job to Azure: ${blobPath}`);
            }
            return { filepath, jobId: jobData.jobId as string };
          } catch (error) {
            logger.error('Failed to upload job to Azure (continuing anyway):', error);
          }
        }

        return { filepath, jobId };
      } else {
        logger.info('No new job files created (duplicates)');
        return { filepath: null };
      }
    } catch (error) {
      logger.error(`Error extracting job for session ${sessionId}:`, error);
      return { filepath: null };
    }
  }

  /**
   * Get all jobs
   */
  async getAllJobs(): Promise<Record<string, unknown>[]> {
    return this.extractor.getAllJobs();
  }

  /**
   * Get job by ID
   */
  async getJobById(jobId: string): Promise<Record<string, unknown> | null> {
    return this.extractor.getJobById(jobId);
  }

  /**
   * Delete job by ID
   */
  async deleteJob(jobId: string): Promise<boolean> {
    return this.extractor.deleteJob(jobId);
  }
}

// Lazy singleton — only instantiated when first needed
let _tracker: JobSummaryTracker | null = null;
export function getJobSummaryTracker(): JobSummaryTracker {
  if (!_tracker) _tracker = new JobSummaryTracker();
  return _tracker;
}
