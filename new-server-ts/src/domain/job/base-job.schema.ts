/**
 * Job schemas for extraction pipeline
 *
 * Uses snake_case field names to match Python API format and Azure storage expectations.
 * Based on server/schema.py
 */
import { z } from 'zod';

// ============================================================================
// SHARED ENUMS (using TypeScript enums for z.nativeEnum)
// ============================================================================

export enum JobCategory {
  PAINTING = 'painting',
  ELECTRICAL = 'electrical',
  PLUMBING = 'plumbing',
  HVAC = 'hvac',
  GENERAL = 'general',
}

export enum UrgencyLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  EMERGENCY = 'emergency',
}

export enum LocationType {
  INDOOR = 'indoor',
  OUTDOOR = 'outdoor',
  BOTH = 'both',
}

export enum ComplexityLevel {
  BASIC = 'basic',
  INTERMEDIATE = 'intermediate',
  COMPLEX = 'complex',
}

// ============================================================================
// ZOD ENUM SCHEMAS
// ============================================================================

export const JobCategorySchema = z.nativeEnum(JobCategory);
export const UrgencyLevelSchema = z.nativeEnum(UrgencyLevel);
export const LocationTypeSchema = z.nativeEnum(LocationType);
export const ComplexityLevelSchema = z.nativeEnum(ComplexityLevel);

// ============================================================================
// BASE JOB SCHEMA
// ============================================================================

export const BaseJobSchema = z.object({
  // Identifiers
  session_id: z.string().optional(),
  job_id: z.string().optional(),
  user_id: z.string().optional().default('anon'),

  // Core fields
  category: JobCategorySchema,
  title: z.string(),
  description: z.string(),

  // Location
  location_type: LocationTypeSchema,
  specific_location: z.string(),

  // Job metadata
  urgency: UrgencyLevelSchema.default(UrgencyLevel.MEDIUM),
  complexity: ComplexityLevelSchema.default(ComplexityLevel.INTERMEDIATE),
  estimated_duration_minutes: z.number().min(0),
  problem_type: z.string(),

  // Additional context
  customer_notes: z.string().optional(),
  tools_needed: z.string().optional(),
  key_details: z.array(z.string()).default([]),

  // Media
  has_images: z.boolean().default(false),
  has_video: z.boolean().default(false),
  visual_analysis: z.string().optional(),

  // Timestamps - optional since LLM may not provide them
  created_at: z.string().optional(),
  last_updated: z.string().optional(),
});

export type BaseJob = z.infer<typeof BaseJobSchema>;

// ============================================================================
// CATEGORY-SPECIFIC JOB SCHEMAS
// ============================================================================

// PaintingJob - extends BaseJob with painting-specific fields
export const PaintingJobSchema = BaseJobSchema.extend({
  category: z.literal(JobCategory.PAINTING),

  // Room details
  number_of_rooms: z.number().min(1).optional(),
  ceiling_height: z.number().optional(),
  room_size: z.string().optional(),

  // Surface details
  number_of_walls: z.number().optional(),
  number_of_doors: z.number().optional(),
  number_of_windows: z.number().optional(),

  // Paint details
  paint_colors: z.array(z.string()).default([]),
  surface_condition: z.string().optional(),
  prep_work_needed: z.string().optional(),
});

export type PaintingJob = z.infer<typeof PaintingJobSchema>;

// ElectricalJob - extends BaseJob with electrical-specific fields
export const ElectricalJobSchema = BaseJobSchema.extend({
  category: z.literal(JobCategory.ELECTRICAL),

  // Work type
  installation_type: z.string().optional(),

  // Electrical specs
  number_of_outlets: z.number().optional(),
  voltage_requirement: z.string().optional(),
  amperage: z.number().optional(),

  // Panel info
  has_existing_panel: z.boolean().optional(),
  panel_capacity: z.string().optional(),

  // Location and wiring
  desired_location: z.string().optional(),
  current_wiring: z.string().optional(),
  permits_required: z.boolean().optional(),
});

export type ElectricalJob = z.infer<typeof ElectricalJobSchema>;

// PlumbingJob - extends BaseJob with plumbing-specific fields
export const PlumbingJobSchema = BaseJobSchema.extend({
  category: z.literal(JobCategory.PLUMBING),

  // Issue details
  issue_type: z.string().optional(),
  fixture_type: z.string().optional(),
  severity: z.string().optional(),

  // Damage assessment
  water_damage: z.boolean().default(false),
  water_shut_off: z.boolean().default(false),

  // Access and system
  access_difficulty: z.string().optional(),
  age_of_plumbing: z.string().optional(),
});

export type PlumbingJob = z.infer<typeof PlumbingJobSchema>;

// HVACJob - extends BaseJob with HVAC-specific fields
export const HVACJobSchema = BaseJobSchema.extend({
  category: z.literal(JobCategory.HVAC),

  // System details
  system_type: z.string().optional(),
  issue_type: z.string().optional(),
  system_age: z.number().optional(),

  // Service history
  last_service_date: z.string().optional(),
  brand_model: z.string().optional(),

  // Space details
  square_footage: z.number().optional(),
  filter_change_frequency: z.string().optional(),
  thermostat_type: z.string().optional(),
});

export type HVACJob = z.infer<typeof HVACJobSchema>;

// GeneralJob - extends BaseJob with general-specific fields
export const GeneralJobSchema = BaseJobSchema.extend({
  category: z.literal(JobCategory.GENERAL),

  work_type: z.string().optional(),
  materials_needed: z.array(z.string()).default([]),
  estimated_scope: z.string().optional(),
  special_requirements: z.string().optional(),
});

export type GeneralJob = z.infer<typeof GeneralJobSchema>;

// ============================================================================
// DISCRIMINATED UNION SCHEMA
// ============================================================================

/**
 * Union schema that validates based on the category field.
 * Use this for primary validation - it will automatically parse into the correct type.
 */
export const JobSchema = z.discriminatedUnion('category', [
  PaintingJobSchema,
  ElectricalJobSchema,
  PlumbingJobSchema,
  HVACJobSchema,
  GeneralJobSchema,
]);

export type Job = z.infer<typeof JobSchema>;

// ============================================================================
// EXPORTS
// ============================================================================

export const JobSchemas = {
  base: BaseJobSchema,
  painting: PaintingJobSchema,
  electrical: ElectricalJobSchema,
  plumbing: PlumbingJobSchema,
  hvac: HVACJobSchema,
  general: GeneralJobSchema,
  union: JobSchema,
} as const;