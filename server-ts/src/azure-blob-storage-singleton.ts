import { AzureBlobStorage } from './azure-blob-storage.js';
import { logger } from './config.js';

let _instance: AzureBlobStorage | null = null;

/**
 * Returns the shared AzureBlobStorage singleton.
 * The first call creates the instance and chains ensureContainer() after init.
 * Subsequent calls return the same instance.
 */
export function getAzureBlobStorage(): AzureBlobStorage {
  if (!_instance) {
    _instance = new AzureBlobStorage();
    _instance.waitForInit().then(() => {
      if (_instance!.isInitialized()) {
        return _instance!.ensureContainer();
      }
    }).catch(err => {
      logger.error('Failed to initialize Azure Blob Storage:', err);
    });
  }
  return _instance;
}
