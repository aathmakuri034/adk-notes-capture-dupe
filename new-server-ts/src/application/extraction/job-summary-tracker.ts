/**
 * Job Summary Tracker - Orchestrates job extraction, local save, and Azure upload
 *
 * Implements JobSummaryService interface.
 * Calls JobExtractor, saves to local file, and uploads to Azure Blob Storage.
 */
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import type pino from 'pino';
import type { JobSummaryService } from '../streaming/types.js';
import { JobExtractor, type GeminiExtractionClient } from './job-extractor.js';
import { createGeminiExtractionClient } from '../../infrastructure/gemini/gemini-extraction-client.js';
import { getConfig } from '../../config/env.js';
import { logger } from '../../shared/logger.js';

// Default output directory
const DEFAULT_OUTPUT_DIR = 'conversation_data';

/**
 * Interface for Azure blob storage operations
 */
export interface BlobStorage {
  uploadJobSchema(jobData: Record<string, unknown>, filename?: string): Promise<string | null>;
}

/**
 * Dependencies for JobSummaryTracker
 */
export interface JobSummaryTrackerDeps {
  logger?: pino.Logger;
  extractionClient?: GeminiExtractionClient;
  blobStorage?: BlobStorage;
  outputDir?: string;
}

/**
 * JobSummaryTracker - orchestrates job extraction, save, and upload
 */
export class JobSummaryTracker implements JobSummaryService {
  private readonly log: pino.Logger;
  private readonly jobExtractor: JobExtractor;
  private readonly blobStorage: BlobStorage;
  private readonly outputDir: string;

  constructor(deps: JobSummaryTrackerDeps = {}) {
    this.log = deps.logger ?? logger;
    this.blobStorage = deps.blobStorage ?? {
      uploadJobSchema: async () => {
        this.log.debug('Azure Blob Storage not configured, skipping upload');
        return null;
      },
    };

    // Set output directory with path traversal protection
    const config = getConfig();
    const configuredDir = deps.outputDir ?? config.JOB_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR;
    this.outputDir = path.resolve(process.cwd(), configuredDir);

    // Initialize job extractor with the extraction client
    const extractionClient = deps.extractionClient ?? createGeminiExtractionClient({
      model: config.EXTRACTION_MODEL,
    });
    this.jobExtractor = new JobExtractor({
      extractionClient,
      logger: this.log,
    });
  }

  /**
   * Extracts job data from note and saves locally + uploads to Azure
   *
   * @param sessionId - The session ID
   * @param title - Note title
   * @param description - Note description
   * @param details - Note details array
   * @returns Job ID if successful, null otherwise
   */
  async extractFromNote(
    sessionId: string,
    title: string,
    description: string,
    details: string[]
  ): Promise<string | null> {
    const jobId = randomUUID();

    try {
      // Combine note data into text for extraction
      const text = this.buildTextFromNote(title, description, details);

      // Extract structured job data
      const extractionResult = await this.jobExtractor.extractFromText(text);

      if (!extractionResult) {
        this.log.warn({ sessionId, jobId }, 'Job extraction returned no result');
        return null;
      }

      const { job, schemaUsed } = extractionResult;

      // Add session_id and job_id to the job data
      const jobData = {
        ...job,
        session_id: sessionId,
        job_id: jobId,
      };

      // Save to local file
      const localPath = await this.saveLocally(jobData, jobId);
      this.log.info({ jobId, localPath, schemaUsed }, 'Job saved locally');

      // Always upload to Azure (stub logs when disabled)
      const azureUrl = await this.blobStorage.uploadJobSchema(jobData, this.getFilename(jobId));
      if (azureUrl) {
        this.log.info({ jobId, azureUrl }, 'Job uploaded to Azure');
      }

      return jobId;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.log.error({ sessionId, jobId, error: errorMessage }, 'Failed to extract and save job');
      return null;
    }
  }

  /**
   * Builds text from note components for extraction
   */
  private buildTextFromNote(title: string, description: string, details: string[]): string {
    const parts = [
      `Title: ${title}`,
      `Description: ${description}`,
      details.length > 0 ? `Details:\n${details.map((d) => `- ${d}`).join('\n')}` : '',
    ];
    return parts.filter(Boolean).join('\n\n');
  }

  /**
   * Saves job data to local file
   */
  private async saveLocally(jobData: Record<string, unknown>, jobId: string): Promise<string> {
    // Ensure output directory exists
    await fs.mkdir(this.outputDir, { recursive: true });

    const filename = this.getFilename(jobId);
    const filepath = path.join(this.outputDir, filename);

    // Path traversal check
    const resolvedPath = path.resolve(filepath);
    const resolvedDir = path.resolve(this.outputDir);
    if (!resolvedPath.startsWith(resolvedDir)) {
      throw new Error('Path traversal detected');
    }

    await fs.writeFile(filepath, JSON.stringify(jobData, null, 2), 'utf-8');
    return filepath;
  }

  /**
   * Generates filename for job data
   */
  private getFilename(jobId: string): string {
    return `job_${jobId}.json`;
  }
}