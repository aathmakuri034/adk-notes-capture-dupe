/**
 * Gemini Extraction Client - Infrastructure layer for REST API calls
 *
 * Provides non-streaming content generation for job extraction.
 * Uses timeout and retry logic for reliability.
 */
import { GoogleGenAI } from '@google/genai';
import { logger } from '../../shared/logger.js';
import { getConfig } from '../../config/env.js';
import { ExternalApiError } from '../../shared/errors.js';

export interface GeminiExtractionConfig {
  model: string;
}

/**
 * Creates a Gemini extraction client for REST API calls
 */
export function createGeminiExtractionClient(config: GeminiExtractionConfig): GeminiExtractionClient {
  const envConfig = getConfig();
  return new GeminiExtractionClientImpl({
    model: config.model,
    timeoutMs: envConfig.STANDARD_API_TIMEOUT_MS,
    maxRetries: envConfig.STANDARD_API_MAX_RETRIES,
  });
}

export interface GeminiExtractionClient {
  generateContent(prompt: string): Promise<string>;
}

interface GeminiExtractionClientImplConfig {
  model: string;
  timeoutMs: number;
  maxRetries: number;
}

class GeminiExtractionClientImpl implements GeminiExtractionClient {
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private ai: GoogleGenAI | null = null;

  // Transient errors that should trigger retry
  private readonly TRANSIENT_ERROR_CODES = [429, 503, 504];

  constructor(config: GeminiExtractionClientImplConfig) {
    this.model = config.model;
    this.timeoutMs = config.timeoutMs;
    this.maxRetries = config.maxRetries;
  }

  private getClient(): GoogleGenAI {
    if (!this.ai) {
      const config = getConfig();

      if (config.GOOGLE_GENAI_USE_VERTEXAI) {
        this.ai = new GoogleGenAI({
          vertexai: true,
          project: config.PROJECT_ID,
          location: config.LOCATION,
        });
      } else if (config.GOOGLE_API_KEY) {
        this.ai = new GoogleGenAI({ apiKey: config.GOOGLE_API_KEY });
      } else {
        this.ai = new GoogleGenAI({});
      }
    }
    return this.ai;
  }

  async generateContent(prompt: string): Promise<string> {
    const client = this.getClient();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await client.models.generateContent({
          model: this.model,
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });

        // Extract text from response
        const text = this.extractText(response);
        if (!text) {
          throw new ExternalApiError('Empty response from Gemini extraction', 'gemini');
        }
        return text;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if this is a retryable error
        if (this.isRetryableError(error) && attempt < this.maxRetries) {
          const delayMs = Math.pow(2, attempt) * 1000; // Exponential backoff
          logger.warn(
            { attempt: attempt + 1, maxRetries: this.maxRetries, delayMs, error: lastError.message },
            'Retryable error, backing off'
          );
          await this.sleep(delayMs);
          continue;
        }

        // Non-retryable error or max retries exceeded
        break;
      }
    }

    // All retries failed or non-retryable error
    throw new ExternalApiError(
      `Gemini extraction failed after ${this.maxRetries + 1} attempts`,
      'gemini',
      lastError
    );
  }

  private extractText(response: unknown): string {
    // The response structure from @google/genai
    const resp = response as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };

    const candidate = resp.candidates?.[0];
    if (!candidate?.content?.parts) {
      return '';
    }

    return candidate.content.parts.map((part) => part.text ?? '').join('');
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      // Check for status code in error message (common pattern)
      const message = error.message;
      for (const code of this.TRANSIENT_ERROR_CODES) {
        if (message.includes(String(code))) {
          return true;
        }
      }
      // Also check if it's a timeout
      if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
        return true;
      }
    }
    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
