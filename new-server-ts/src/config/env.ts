import { z } from 'zod';
import dotenv from 'dotenv';

// Coerce env string to boolean: "TRUE"/"true"/"1" → true, everything else → false
const booleanFromEnv = z.preprocess(
  (val) => {
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') return val.toUpperCase() === 'TRUE' || val === '1';
    return false;
  },
  z.boolean(),
);

const EnvSchema = z.object({
  PROJECT_ID: z.string().optional(),
  LOCATION: z.string().default('us-central1'),
  MODEL: z.string().default('gemini-live-2.5-flash-native-audio'),
  EXTRACTION_MODEL: z.string().default('gemini-2.0-flash'),
  VOICE_NAME: z.string().default('Aoede'),
  GOOGLE_API_KEY: z.string().optional(),
  GOOGLE_GENAI_USE_VERTEXAI: booleanFromEnv.default(false),
  JOB_SERVICE_PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  NOTES_SERVICE_PORT: z.coerce.number().int().min(1).max(65535).default(8081),
  AZURE_STORAGE_CONNECTION_STRING: z.string().optional(),
  AZURE_CONTAINER_NAME: z.string().transform((val) => val.replace(/['"]/g, '')).default('extracted-data'),
  USE_AZURE_STORAGE: booleanFromEnv.default(false),
  VIDEO_API_MODEL: z.string().default('gemini-2.0-flash'),
  VIDEO_MAX_SIZE_MB: z.coerce.number().int().positive().default(50),
  STANDARD_API_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  STANDARD_API_MAX_RETRIES: z.coerce.number().int().nonnegative().default(3),
  USE_STANDARD_API_FOR_VIDEO: booleanFromEnv.default(true),
  JOB_OUTPUT_DIR: z.string().optional(),
});

export type EnvConfig = z.infer<typeof EnvSchema>;

function readEnv(): EnvConfig {
  const env = process.env;
  return EnvSchema.parse({
    ...env,
    GOOGLE_API_KEY: env.GOOGLE_API_KEY ?? env.GEMINI_API_KEY,
    USE_AZURE_STORAGE: !!env.AZURE_STORAGE_CONNECTION_STRING,
  });
}

let configCache: EnvConfig | null = null;

export function getConfig(): EnvConfig {
  if (!configCache) {
    configCache = readEnv();
  }
  return configCache;
}

export function loadEnv(envPath?: string): void {
  dotenv.config(envPath ? { path: envPath } : undefined);
  configCache = null; // Reset cache to pick up new values
}

export function validateEnvVars(): void {
  const config = getConfig();

  // Live API requires Vertex AI
  if (!config.GOOGLE_GENAI_USE_VERTEXAI) {
    throw new Error(`
======================================================================
ERROR: Live API requires Vertex AI authentication
======================================================================

The Gemini Live API (used for real-time voice streaming) requires
Vertex AI authentication with OAuth2 credentials. API keys are NOT
supported for Live API connections.

Please update your .env file:
  GOOGLE_GENAI_USE_VERTEXAI=TRUE
  PROJECT_ID=your-project-id
  LOCATION=us-central1

Then set up Google Cloud credentials:
  - Set GOOGLE_APPLICATION_CREDENTIALS to service account key file, OR
  - Run: gcloud auth application-default login

======================================================================
`);
  }

  const missing: string[] = [];
  if (!config.PROJECT_ID) {
    missing.push('PROJECT_ID (required for Vertex AI)');
  }
  if (!config.LOCATION) {
    missing.push('LOCATION (required for Vertex AI)');
  }

  if (missing.length > 0) {
    throw new Error(`
======================================================================
ERROR: Missing required environment variables: ${missing.join(', ')}
======================================================================

Please create a .env file with:
  PROJECT_ID=your-project-id
  LOCATION=us-central1
  GOOGLE_GENAI_USE_VERTEXAI=TRUE

======================================================================
`);
  }
}
