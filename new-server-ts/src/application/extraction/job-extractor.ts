/**
 * Job Extractor - Application layer for extracting structured job data from text
 *
 * Uses a single LLM call with Zod validation and BaseJob fallback.
 */
import { logger } from '../../shared/logger.js';
import type { Logger } from 'pino';
import { buildExtractionPrompt } from './extraction-prompt-builder.js';
import { JobSchemas, type Job, type BaseJob } from '../../domain/job/base-job.schema.js';
import { ExternalApiError } from '../../shared/errors.js';

export interface GeminiExtractionClient {
  generateContent(prompt: string): Promise<string>;
}

export interface JobExtractorDeps {
  extractionClient: GeminiExtractionClient;
  logger?: Logger;
}

/**
 * Result of job extraction
 */
export interface ExtractionResult {
  job: Job | BaseJob;
  schemaUsed: 'category_specific' | 'base';
}

/**
 * JobExtractor - extracts structured job data from voice note text
 */
export class JobExtractor {
  private readonly extractionClient: GeminiExtractionClient;
  private readonly log: Logger;

  constructor(deps: JobExtractorDeps) {
    this.extractionClient = deps.extractionClient;
    this.log = deps.logger ?? logger;
  }

  /**
   * Extracts job data from the given text
   *
   * @param text - The voice note text to extract from
   * @returns The extracted job data or null if extraction failed
   */
  async extractFromText(text: string): Promise<ExtractionResult | null> {
    const startTime = Date.now();

    try {
      // Build the prompt
      const prompt = buildExtractionPrompt(text);

      // Call Gemini
      this.log.debug({ textLength: text.length }, 'Calling Gemini for job extraction');
      const rawResponse = await this.extractionClient.generateContent(prompt);

      // Parse JSON from response (handle markdown code blocks)
      const parsed = this.safeJsonParse(rawResponse);
      if (!parsed || typeof parsed !== 'object') {
        this.log.warn({ rawResponse: rawResponse.slice(0, 200) }, 'Failed to parse JSON from Gemini response');
        return null;
      }

      // Validate with fallback: try category-specific first, then BaseJob
      const result = this.validateWithFallback(parsed);

      if (!result) {
        this.log.warn({ parsed }, 'Job validation failed for both category-specific and base schemas');
        return null;
      }

      const durationMs = Date.now() - startTime;
      this.log.info(
        {
          operation: 'job_extraction',
          durationMs,
          success: true,
          category: result.job.category,
          schemaUsed: result.schemaUsed,
        },
        'Job extraction completed successfully'
      );

      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.log.error(
        { operation: 'job_extraction', durationMs, error: errorMessage },
        'Job extraction failed'
      );

      return null;
    }
  }

  /**
   * Safely parses JSON from Gemini response
   * Handles markdown code blocks (```json ... ```)
   */
  private safeJsonParse(raw: string): unknown {
    try {
      // Try to extract JSON from markdown code blocks
      let jsonStr = raw.trim();

      // Check for markdown code block
      const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch && codeBlockMatch[1]) {
        jsonStr = codeBlockMatch[1].trim();
      }

      // Also handle case where response is just a JSON string
      if (jsonStr.startsWith('```') && jsonStr.endsWith('```')) {
        // Already handled above, but just in case
        jsonStr = jsonStr.replace(/^```\w*\n?/, '').replace(/```$/, '').trim();
      }

      return JSON.parse(jsonStr);
    } catch (error) {
      this.log.debug({ raw: raw.slice(0, 200) }, 'Failed to parse JSON');
      return null;
    }
  }

  /**
   * Validates the parsed data with BaseJob fallback
   *
   * 1. First try category-specific schemas (discriminatedUnion)
   * 2. If that fails, try BaseJob schema (common fields only)
   * 3. Return the valid result or null
   */
  private validateWithFallback(data: unknown): ExtractionResult | null {
    // First try: category-specific schemas (discriminatedUnion)
    const categorySpecificResult = JobSchemas.union.safeParse(data);
    if (categorySpecificResult.success) {
      return {
        job: categorySpecificResult.data as Job,
        schemaUsed: 'category_specific',
      };
    }

    this.log.debug(
      { error: categorySpecificResult.error?.issues },
      'Category-specific validation failed, trying BaseJob'
    );

    // Second try: BaseJob schema (common fields only)
    const baseResult = JobSchemas.base.safeParse(data);
    if (baseResult.success) {
      return {
        job: baseResult.data as BaseJob,
        schemaUsed: 'base',
      };
    }

    this.log.debug(
      { error: baseResult.error?.issues },
      'BaseJob validation also failed'
    );

    return null;
  }
}