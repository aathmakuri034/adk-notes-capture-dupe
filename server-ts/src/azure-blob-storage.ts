import type { BlobServiceClient, ContainerClient } from '@azure/storage-blob';
import { config, logger } from './config.js';

/**
 * Transform TypeScript camelCase job schema to Python snake_case format
 * This ensures compatibility with the frontend API and JobBoard component
 * Uses FLAT structure (not nested metadata) to match API expectations
 */
function transformToFrontendFormat(job: Record<string, unknown>): Record<string, unknown> {
  // Helper to convert camelCase to snake_case
  const toSnakeCase = (str: string): string => {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  };

  // Start with explicitly mapped core fields
  const transformed: Record<string, unknown> = {
    // Core fields
    job_id: job.jobId || job.id,
    session_id: job.sessionId,
    user_id: job.userId,
    title: job.title,
    description: job.description,
    created_at: job.createdAt,
    last_updated: job.lastUpdated,

    // Flat metadata fields (API expects these at root level)
    estimated_duration_minutes: job.estimatedDurationMinutes || 0,
    urgency: job.urgency || 'medium',
    specific_location: job.specificLocation,
    location_type: job.locationType,
    category: job.category,
    issue_type: job.problemType,
    complexity: job.complexity,
    communication_preference: 'phone',
    key_details: job.keyDetails || [],
  };

  // Add specialized fields (convert camelCase to snake_case)
  const coreFields = [
    'jobId', 'id', 'sessionId', 'userId', 'title', 'description', 'createdAt',
    'lastUpdated', 'estimatedDurationMinutes', 'urgency', 'specificLocation',
    'locationType', 'category', 'problemType', 'complexity', 'keyDetails',
    'hasImages', 'hasVideo', 'visualAnalysis', 'customerNotes', 'toolsNeeded',
    'subJobType', 'videoFiles'
  ];

  for (const [key, value] of Object.entries(job)) {
    if (!coreFields.includes(key) && value !== undefined && value !== null) {
      const snakeKey = toSnakeCase(key);
      transformed[snakeKey] = value;
    }
  }

  // Add optional base fields if present
  if (job.hasImages !== undefined) transformed.has_images = job.hasImages;
  if (job.hasVideo !== undefined) transformed.has_video = job.hasVideo;
  if (job.visualAnalysis) transformed.visual_analysis = job.visualAnalysis;
  if (job.customerNotes) transformed.customer_notes = job.customerNotes;
  if (job.toolsNeeded) transformed.tools_needed = job.toolsNeeded;
  if (job.subJobType) transformed.sub_job_type = job.subJobType;
  if (job.videoFiles) transformed.video_files = job.videoFiles;

  return transformed;
}

export class AzureBlobStorage {
  private blobServiceClient: BlobServiceClient | null = null;
  private containerClient: ContainerClient | null = null;
  private containerName: string;
  private initialized: boolean = false;

  private initPromise: Promise<void>;

  constructor(connectionString?: string, containerName?: string) {
    this.containerName = containerName || config.AZURE_CONTAINER_NAME;
    this.initPromise = this.init(connectionString);
  }

  private async init(connectionString?: string): Promise<void> {
    if (!connectionString && !config.AZURE_STORAGE_CONNECTION_STRING) {
      logger.warn('Azure Storage connection string not provided. Blob storage disabled.');
      return;
    }

    try {
      const { BlobServiceClient: BSC } = await import('@azure/storage-blob');
      const connStr = connectionString || config.AZURE_STORAGE_CONNECTION_STRING!;
      this.blobServiceClient = BSC.fromConnectionString(connStr);
      this.containerClient = this.blobServiceClient.getContainerClient(this.containerName);
      this.initialized = true;
      logger.info(`Azure Blob Storage initialized for container: ${this.containerName}`);
    } catch (error) {
      logger.error('Failed to initialize Azure Blob Storage:', error);
    }
  }

  async waitForInit(): Promise<void> {
    await this.initPromise;
  }

  async ensureContainer(): Promise<void> {
    if (!this.containerClient) return;

    try {
      await this.containerClient.createIfNotExists();
      logger.info(`Using Azure container: ${this.containerName}`);
    } catch (error) {
      logger.error('Failed to ensure container exists:', error);
    }
  }

  async uploadJobSchema(
    jobData: Record<string, unknown>,
    filename?: string
  ): Promise<string | null> {
    if (!this.initialized || !this.containerClient) {
      logger.warn('Azure Blob Storage not initialized, skipping upload');
      return null;
    }

    try {
      // Transform TypeScript format to frontend-compatible format
      const transformedData = transformToFrontendFormat(jobData);

      // Generate filename if not provided
      const now = new Date();
      const dateFolder = this.formatDateFolder(now);
      const timestamp = this.formatTimestamp(now);
      const blobName = filename
        ? `job-schemas/${dateFolder}/${filename}.json`
        : `job-schemas/${dateFolder}/job_schema_${timestamp}.json`;

      // Convert job data to JSON
      const jsonData = JSON.stringify(transformedData, null, 2);

      // Upload to Azure
      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.upload(jsonData, jsonData.length, {
        blobHTTPHeaders: {
          blobContentType: 'application/json',
        },
      });

      logger.info(`Uploaded job schema to Azure: ${blobName}`);
      return blobName;
    } catch (error) {
      logger.error('Failed to upload job schema to Azure:', error);
      return null;
    }
  }

  private formatDateFolder(date: Date): string {
    // Format: YYYY-MM-DD
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private formatTimestamp(date: Date): string {
    // Format: YYYYMMdd_HHMMSS
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const second = String(date.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}_${hour}${minute}${second}`;
  }

  /**
   * Upload voice note JSON to Azure Blob Storage
   * Path: voice-notes/YYYY-MM-DD/{filename}.json
   */
  async uploadVoiceNote(
    noteData: Record<string, unknown>,
    filename?: string
  ): Promise<string | null> {
    if (!this.initialized || !this.containerClient) {
      logger.warn('Azure Blob Storage not initialized, skipping voice note upload');
      return null;
    }

    try {
      const now = new Date();
      const dateFolder = this.formatDateFolder(now);
      const timestamp = this.formatTimestamp(now);
      const blobName = filename
        ? `voice-notes/${dateFolder}/${filename}.json`
        : `voice-notes/${dateFolder}/voice_note_${timestamp}.json`;

      const jsonData = JSON.stringify(noteData, null, 2);

      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.upload(jsonData, jsonData.length, {
        blobHTTPHeaders: {
          blobContentType: 'application/json',
        },
      });

      logger.info(`Uploaded voice note to Azure: ${blobName}`);
      return blobName;
    } catch (error) {
      logger.error('Failed to upload voice note to Azure:', error);
      return null;
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * List all job schemas from Azure Blob Storage
   * Returns parsed JSON objects sorted newest first
   */
  async listJobSchemas(): Promise<Record<string, unknown>[]> {
    await this.waitForInit();
    if (!this.initialized || !this.containerClient) {
      logger.warn('Azure Blob Storage not initialized, cannot list job schemas');
      return [];
    }

    const jobs: Record<string, unknown>[] = [];

    try {
      for await (const blob of this.containerClient.listBlobsFlat({ prefix: 'job-schemas/' })) {
        if (!blob.name.endsWith('.json')) continue;
        try {
          const blobClient = this.containerClient.getBlobClient(blob.name);
          const downloaded = await blobClient.downloadToBuffer();
          const jobData = JSON.parse(downloaded.toString());
          jobs.push(jobData);
        } catch (error) {
          logger.error(`Error reading blob ${blob.name}:`, error);
        }
      }
    } catch (error) {
      logger.error('Error listing job schemas from Azure:', error);
      return [];
    }

    // Sort newest first
    jobs.sort((a, b) => {
      const aDate = (a.created_at as string) || '';
      const bDate = (b.created_at as string) || '';
      return bDate.localeCompare(aDate);
    });

    return jobs;
  }

  /**
   * Get a single job schema by job ID from Azure Blob Storage
   */
  async getJobSchemaById(jobId: string): Promise<Record<string, unknown> | null> {
    await this.waitForInit();
    if (!this.initialized || !this.containerClient) {
      logger.warn('Azure Blob Storage not initialized, cannot get job schema');
      return null;
    }

    try {
      for await (const blob of this.containerClient.listBlobsFlat({ prefix: 'job-schemas/' })) {
        if (!blob.name.endsWith('.json')) continue;
        // Quick filename check to avoid downloading every blob
        if (!blob.name.includes(jobId)) continue;
        try {
          const blobClient = this.containerClient.getBlobClient(blob.name);
          const downloaded = await blobClient.downloadToBuffer();
          const jobData = JSON.parse(downloaded.toString());
          if (jobData.job_id === jobId) return jobData;
        } catch (error) {
          logger.error(`Error reading blob ${blob.name}:`, error);
        }
      }
    } catch (error) {
      logger.error('Error searching job schemas in Azure:', error);
    }

    return null;
  }

  /**
   * Delete job schema(s) by job ID from Azure Blob Storage
   * Returns the number of deleted blobs
   */
  async deleteJobSchemaById(jobId: string): Promise<number> {
    await this.waitForInit();
    if (!this.initialized || !this.containerClient) {
      logger.warn('Azure Blob Storage not initialized, cannot delete job schema');
      return 0;
    }

    let deleted = 0;
    try {
      for await (const blob of this.containerClient.listBlobsFlat({ prefix: 'job-schemas/' })) {
        if (!blob.name.endsWith('.json')) continue;
        if (!blob.name.includes(jobId)) continue;
        try {
          const blobClient = this.containerClient.getBlobClient(blob.name);
          const result = await blobClient.deleteIfExists();
          if (result.succeeded) {
            deleted += 1;
            logger.info(`Deleted job schema from Azure: ${blob.name}`);
          }
        } catch (error) {
          logger.error(`Error deleting blob ${blob.name}:`, error);
        }
      }
    } catch (error) {
      logger.error('Error deleting job schemas from Azure:', error);
      return deleted;
    }

    return deleted;
  }

  /**
   * Upload transcript text to Azure Blob Storage
   * Path: transcripts/YYYY-MM-DD/{session_id}.txt
   */
  async uploadTranscript(transcriptText: string, sessionId: string): Promise<string | null> {
    if (!this.initialized || !this.containerClient) {
      logger.warn('Azure Blob Storage not initialized, skipping transcript upload');
      return null;
    }

    try {
      const now = new Date();
      const dateFolder = this.formatDateFolder(now);
      const blobName = `transcripts/${dateFolder}/${sessionId}.txt`;

      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.upload(transcriptText, Buffer.byteLength(transcriptText, 'utf8'), {
        blobHTTPHeaders: {
          blobContentType: 'text/plain; charset=utf-8',
        },
      });

      logger.info(`Uploaded transcript to Azure: ${blobName}`);
      return blobName;
    } catch (error) {
      logger.error('Failed to upload transcript to Azure:', error);
      return null;
    }
  }

  /**
   * Upload media file (image or video) to Azure Blob Storage
   * Path: transcripts/YYYY-MM-DD/{filename}
   */
  async uploadMedia(buffer: Buffer, filename: string, mimeType: string): Promise<string | null> {
    if (!this.initialized || !this.containerClient) {
      logger.warn('Azure Blob Storage not initialized, skipping media upload');
      return null;
    }

    try {
      const now = new Date();
      const dateFolder = this.formatDateFolder(now);
      const blobName = `transcripts/${dateFolder}/${filename}`;

      const blockBlobClient = this.containerClient.getBlockBlobClient(blobName);
      await blockBlobClient.upload(buffer, buffer.length, {
        blobHTTPHeaders: {
          blobContentType: mimeType,
        },
      });

      logger.info(`Uploaded media to Azure: ${blobName}`);
      return blobName;
    } catch (error) {
      logger.error('Failed to upload media to Azure:', error);
      return null;
    }
  }
}
