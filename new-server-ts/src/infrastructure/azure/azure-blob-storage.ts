/**
 * Azure Blob Storage stub for new-server-ts
 * TODO: Implement full functionality
 */
export class AzureBlobStorage {
  private initialized: boolean = false;

  constructor() {
    // Stub: no initialization
    this.initialized = true;
    console.log('Azure Blob Storage stub initialized');
  }

  async waitForInit(): Promise<void> {
    // Stub: no-op
  }

  async ensureContainer(): Promise<void> {
    // Stub: no-op
  }

  async uploadJobSchema(
    jobData: Record<string, unknown>,
    filename?: string
  ): Promise<string | null> {
    console.log('AzureBlobStorage.uploadJobSchema: stub called', { filename });
    return null;
  }

  async uploadVoiceNote(
    noteData: Record<string, unknown>,
    filename?: string
  ): Promise<string | null> {
    console.log('AzureBlobStorage.uploadVoiceNote: stub called', { filename });
    return null;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async listJobSchemas(): Promise<Record<string, unknown>[]> {
    console.log('AzureBlobStorage.listJobSchemas: stub called');
    return [];
  }

  async getJobSchemaById(jobId: string): Promise<Record<string, unknown> | null> {
    console.log('AzureBlobStorage.getJobSchemaById: stub called', { jobId });
    return null;
  }

  async deleteJobSchemaById(jobId: string): Promise<number> {
    console.log('AzureBlobStorage.deleteJobSchemaById: stub called', { jobId });
    return 0;
  }

  async uploadTranscript(transcriptText: string, sessionId: string): Promise<string | null> {
    console.log('AzureBlobStorage.uploadTranscript: stub called', { sessionId });
    return null;
  }

  async uploadMedia(buffer: Buffer, filename: string, mimeType: string): Promise<string | null> {
    console.log('AzureBlobStorage.uploadMedia: stub called', { filename, mimeType });
    return null;
  }
}
