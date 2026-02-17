// Job Schema TypeScript Definitions

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

// Video metadata interface
export interface VideoMetadata {
  filename: string;
  mimeType: string;
  uploadedAt: string;
  azureBlobPath?: string;
  publicUrl?: string;  // Optional - only if using Gemini Live API fallback
  analysisText?: string;  // NEW: Store standard API analysis
  processingMethod: 'live_api' | 'standard_api';  // NEW: Track which API was used
}

// Base Job interface
export interface BaseJob {
  // Identifiers
  sessionId?: string;
  jobId?: string;
  userId?: string;

  // Core fields
  category: JobCategory;
  subJobType?: string;
  title: string;
  description: string;

  // Location
  locationType: LocationType;
  specificLocation?: string;

  // Job metadata
  urgency?: UrgencyLevel;
  complexity: ComplexityLevel;
  estimatedDurationMinutes: number;
  problemType: string;

  // Additional context
  customerNotes?: string;
  toolsNeeded?: string;
  keyDetails: string[];

  // Media
  hasImages: boolean;
  hasVideo: boolean;
  videoFiles?: VideoMetadata[];  // Track multiple videos
  visualAnalysis?: string;

  // Timestamps
  createdAt: string;
  lastUpdated?: string;
}

// Painting Job
export interface PaintingJob extends BaseJob {
  category: JobCategory.PAINTING;
  numberOfRooms?: number;
  ceilingHeight?: number;
  roomSize?: string;
  numberOfWalls?: number;
  numberOfDoors?: number;
  numberOfWindows?: number;
  paintColors?: string[];
  surfaceCondition?: string;
  prepWorkNeeded?: string;
}

// Electrical Job
export interface ElectricalJob extends BaseJob {
  category: JobCategory.ELECTRICAL;
  installationType?: string;
  numberOfOutlets?: number;
  voltageRequirement?: string;
  amperage?: number;
  hasExistingPanel?: boolean;
  panelCapacity?: string;
  desiredLocation?: string;
  currentWiring?: string;
  permitsRequired?: boolean;
}

// Plumbing Job
export interface PlumbingJob extends BaseJob {
  category: JobCategory.PLUMBING;
  issueType?: string;
  fixtureType?: string;
  severity?: string;
  waterDamage?: boolean;
  waterShutOff?: boolean;
  accessDifficulty?: string;
  ageOfPlumbing?: string;
}

// HVAC Job
export interface HVACJob extends BaseJob {
  category: JobCategory.HVAC;
  systemType?: string;
  issueType?: string;
  systemAge?: number;
  lastServiceDate?: string;
  brandModel?: string;
  squareFootage?: number;
  filterChangeFrequency?: string;
  thermostatType?: string;
}

// General Job
export interface GeneralJob extends BaseJob {
  category: JobCategory.GENERAL;
  workType?: string;
  materialsNeeded?: string[];
  estimatedScope?: string;
  specialRequirements?: string;
}

// Union type for all jobs
export type Job = PaintingJob | ElectricalJob | PlumbingJob | HVACJob | GeneralJob;

// Subjob types for each category
export enum PlumbingSubJobType {
  BURST_PIPE = 'Burst Pipe',
  DRAIN_CLEANING = 'Drain Cleaning',
  WATER_HEATER = 'Water Heater',
  FIXTURE_REPLACEMENT = 'Fixture Replacement',
  SEWER_LINE = 'Sewer Line',
}

export enum ElectricalSubJobType {
  OUTLET_REPAIR = 'Outlet Repair',
  WIRING_PROBLEMS = 'Wiring Problems',
  CODE_COMPLIANCE = 'Code Compliance',
  LIGHTING_SYSTEMS = 'Lighting Systems',
  CEILING_FANS = 'Ceiling Fans',
}

export enum HVACSubJobType {
  AC_INSTALLATION_REPAIR = 'AC Installation/Repair',
  REFRIGERANT_RECHARGING = 'Refrigerant Recharging',
  DUCT_CLEANING = 'Duct Cleaning and Sealing',
  HUMIDIFIER = 'Humidifier',
  FILTER_REPLACEMENT = 'Filter Replacement',
}

export enum PaintingSubJobType {
  WALL_CEILING_PAINTING = 'Wall Ceiling Painting',
  CABINET_REFINISHING = 'Cabinet Refinishing',
  WALLPAPER_SERVICES = 'Wallpaper Services',
  EXTERIOR_HOUSE_PAINTING = 'Exterior House Painting',
  DECK_PAINTING_STAIN = 'Deck Painting/Stain',
}

export enum GeneralSubJobType {
  INSPECTIONS = 'Inspections',
  PERMIT_PROCUREMENT = 'Permit Procurement',
  HOME_ADDITIONS = 'Home Additions',
  DISASTER_RECOVERY = 'Disaster Recovery',
}


// Helper function to create a job ID
export function generateJobId(): string {
  const timestamp = new Date().toISOString();
  const crypto = globalThis.crypto || require('crypto');
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().slice(0, 12);
  }
  // Fallback
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Helper to validate job data
export function validateJob(data: Record<string, unknown>): Job | null {
  const category = (data.category as string)?.toLowerCase();

  if (!category || !Object.values(JobCategory).includes(category as JobCategory)) {
    return null;
  }

  const baseJob: BaseJob = {
    category: category as JobCategory,
    subJobType: (data.sub_job_type as string) || (data.subJobType as string),
    userId: (data.user_id as string) || (data.userId as string) || 'anon',
    title: (data.title as string) || 'Untitled Job',
    description: (data.description as string) || '',
    locationType: (data.location_type as LocationType) || (data.locationType as LocationType) || LocationType.INDOOR,
    specificLocation: (data.specific_location as string) || (data.specificLocation as string),
    urgency: (data.urgency as UrgencyLevel) || UrgencyLevel.MEDIUM,
    complexity: (data.complexity as ComplexityLevel) || ComplexityLevel.INTERMEDIATE,
    estimatedDurationMinutes: (data.estimated_duration_minutes as number) || (data.estimatedDurationMinutes as number) || 60,
    problemType: (data.problem_type as string) || (data.problemType as string) || '',
    customerNotes: (data.customer_notes as string) || (data.customerNotes as string),
    toolsNeeded: (data.tools_needed as string) || (data.toolsNeeded as string),
    keyDetails: (data.key_details as string[]) || (data.keyDetails as string[]) || [],
    hasImages: (data.has_images as boolean) || (data.hasImages as boolean) || false,
    hasVideo: (data.has_video as boolean) || (data.hasVideo as boolean) || false,
    visualAnalysis: (data.visual_analysis as string) || (data.visualAnalysis as string),
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
  };

  // Convert specialized field names from snake_case to camelCase
  const normalizeFieldName = (key: string): string => {
    return key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  };

  // Preserve all specialized fields from the extracted data
  const specializedFields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    // Skip fields already handled in baseJob
    const baseFieldKeys = [
      'category', 'sub_job_type', 'subJobType', 'user_id', 'userId', 'title',
      'description', 'location_type', 'locationType', 'specific_location',
      'specificLocation', 'urgency', 'complexity', 'estimated_duration_minutes',
      'estimatedDurationMinutes', 'problem_type', 'problemType', 'customer_notes',
      'customerNotes', 'tools_needed', 'toolsNeeded', 'key_details', 'keyDetails',
      'has_images', 'hasImages', 'has_video', 'hasVideo', 'visual_analysis',
      'visualAnalysis', 'createdAt', 'lastUpdated'
    ];

    if (!baseFieldKeys.includes(key)) {
      const camelKey = normalizeFieldName(key);
      specializedFields[camelKey] = value;
    }
  }

  // Merge base job with specialized fields
  return { ...baseJob, ...specializedFields } as Job;
}
