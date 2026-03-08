/**
 * Job domain types
 *
 * Re-exports types inferred from Zod schemas in base-job.schema.ts
 */
export {
  type BaseJob,
  type PaintingJob,
  type ElectricalJob,
  type PlumbingJob,
  type HVACJob,
  type GeneralJob,
  type Job,
  type JobCategory,
  type UrgencyLevel,
  type LocationType,
  type ComplexityLevel,
} from './base-job.schema.js';

export { JobSchemas } from './base-job.schema.js';
