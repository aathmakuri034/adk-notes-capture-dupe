import type { Storage } from '@google-cloud/storage';
import { logger } from './config.js';

export class GcsStorage {
  private storage: Storage | null = null;
  private bucketName: string;
  private initialized: boolean = false;
  private initPromise: Promise<void>;

  constructor(projectId: string) {
    this.bucketName = `${projectId}-job-assistant-media`;
    this.initPromise = this.init(projectId);
  }

  private async init(projectId: string): Promise<void> {
    try {
      const { Storage: GcsStorageClass } = await import('@google-cloud/storage');
      this.storage = new GcsStorageClass({ projectId });
      this.initialized = true;
      logger.info(`GCS Storage initialized for bucket: ${this.bucketName}`);
    } catch (error) {
      logger.error('Failed to initialize GCS Storage:', error);
    }
  }

  async waitForInit(): Promise<void> {
    await this.initPromise;
  }

  async ensureBucket(): Promise<void> {
    if (!this.storage) return;

    try {
      const bucket = this.storage.bucket(this.bucketName);
      const [exists] = await bucket.exists();

      if (!exists) {
        await this.storage.createBucket(this.bucketName);
        logger.info(`Created GCS bucket: ${this.bucketName}`);
      }

      // Note: Bucket permissions should be configured manually in Google Cloud Console
      // Set "allUsers" with "Storage Object Viewer" role for public read access
      logger.info(`GCS bucket verified: ${this.bucketName}`);
    } catch (error) {
      logger.error('Failed to ensure GCS bucket exists:', error);
    }
  }

  async uploadVideo(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
    if (!this.initialized || !this.storage) {
      throw new Error('GCS Storage not initialized');
    }

    const blobPath = `uploads/${filename}`;
    const bucket = this.storage.bucket(this.bucketName);
    const file = bucket.file(blobPath);

    // Upload the file (inherits bucket-level public read permission)
    // Works with uniform bucket-level access
    await file.save(buffer, {
      metadata: { contentType: mimeType },
    });

    // Generate public URL (Gemini Live API requires public HTTPS URLs)
    const publicUrl = `https://storage.googleapis.com/${this.bucketName}/${blobPath}`;

    logger.info(`Uploaded video to GCS, public URL generated: ${publicUrl}`);
    return publicUrl;
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}
