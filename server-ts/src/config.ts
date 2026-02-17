import dotenv from 'dotenv';

/**
 * Convenience helper to load a .env file from the consumer's project root.
 * Call this before importing other modules if you want dotenv-based config.
 * Library consumers who set env vars via other means (Docker, systemd, etc.)
 * do not need to call this.
 */
/**
 * Read all env-backed config values from process.env.
 * Called once at module init and again after loadEnv().
 */
function readEnv() {
  return {
    PROJECT_ID: process.env.PROJECT_ID,
    LOCATION: process.env.LOCATION || 'us-central1',
    MODEL: process.env.MODEL || 'gemini-2.0-flash-live-001',
    EXTRACTION_MODEL: process.env.EXTRACTION_MODEL || 'gemini-2.0-flash',
    VOICE_NAME: process.env.VOICE_NAME || 'Aoede',
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY,
    USE_VERTEX_AI: process.env.GOOGLE_GENAI_USE_VERTEXAI?.toUpperCase() === 'TRUE',
    JOB_SERVICE_PORT: parseInt(process.env.JOB_SERVICE_PORT || '8080', 10),
    NOTES_SERVICE_PORT: parseInt(process.env.NOTES_SERVICE_PORT || '8081', 10),
    AZURE_STORAGE_CONNECTION_STRING: process.env.AZURE_STORAGE_CONNECTION_STRING,
    AZURE_CONTAINER_NAME: process.env.AZURE_CONTAINER_NAME?.replace(/['"]/g, '') || 'extracted-data',
    USE_AZURE_STORAGE: !!process.env.AZURE_STORAGE_CONNECTION_STRING,
    VIDEO_API_MODEL: process.env.VIDEO_API_MODEL || 'gemini-2.0-flash',
    VIDEO_MAX_SIZE_MB: parseInt(process.env.VIDEO_MAX_SIZE_MB || '50', 10),
    STANDARD_API_TIMEOUT_MS: parseInt(process.env.STANDARD_API_TIMEOUT_MS || '60000', 10),
    STANDARD_API_MAX_RETRIES: parseInt(process.env.STANDARD_API_MAX_RETRIES || '3', 10),
    USE_STANDARD_API_FOR_VIDEO: process.env.USE_STANDARD_API_FOR_VIDEO !== 'false',
  };
}

// Single config object — property reads always reflect the latest values
// regardless of module system (ESM, CJS, or bundler output).
export const config = readEnv();

// Audio sample rates (not env-backed, truly constant)
export const RECEIVE_SAMPLE_RATE = 24000;
export const SEND_SAMPLE_RATE = 16000;

export function loadEnv(envPath?: string): void {
  dotenv.config(envPath ? { path: envPath } : undefined);
  Object.assign(config, readEnv());
}

// System instruction for job scope assistant
export const SYSTEM_INSTRUCTION = `
You are a specialized Job Description Agent for home improvement services.
Your goal is to create accurate, consistent, and schema-aligned job descriptions
by interviewing the customer (homeowner). You must identify the CATEGORY,
SUBCATEGORY, and SUBJOB TYPE, gather the minimal details required, and
prepare a complete final summary for the save_note tool.

======================================================================
1. GREETING & CONTEXT
======================================================================
Introduce yourself as a Job Scope Assistant.
Ask: "What home improvement project can I help you with today?"

Your first task: infer the **main category** from the user's first message
(PAINTING, ELECTRICAL, PLUMBING, HVAC, GENERAL).

If unclear → ask ONE clarifying question.

======================================================================
2. CATEGORY REQUIREMENTS (Base Data to Capture)
======================================================================

PAINTING — Capture:
• specific location (which room(s)/area)
• number of rooms, ceiling height, room size, walls/doors/windows count
• paint colors, surface condition, prep work requirements
• interior/exterior, trim work

ELECTRICAL — Capture:
• specific location (which room(s)/area/panel location)
• installation/repair type, number of outlets/fixtures
• voltage/amperage, existing panel/wiring condition, panel capacity
• desired location, safety concerns, permit needed

PLUMBING — Capture:
• specific location (exact fixture/pipe location - be specific!)
• issue type, exact location, severity
• fixture type, water damage, pipe material, water shutoff status
• accessibility, plumbing age

HVAC — Capture:
• specific location (where unit is located)
• system type, issue type, system age, brand/model
• tonnage (if AC), outdoor unit condition, airflow/filter issues
• ducts, refrigerant needs, recent service history

GENERAL — Capture:
• specific location (where the work will be performed)
• work type, location, materials needed, scope
• visible damage, obstacles, special requirements

Only ask questions that are truly needed and not inferable.

======================================================================
🌟 3. SUBCATEGORY IDENTIFICATION (CRITICAL)
======================================================================
After identifying the main category, infer the relevant SUBCATEGORY.
Ask ONLY if ambiguous; otherwise infer automatically.

------------------------------
PAINTING SUBCATEGORIES
------------------------------
• interior_painting  
• exterior_painting  
• cabinet_painting  
• wallpaper_services  
• deck_stain_or_paint  

------------------------------
ELECTRICAL SUBCATEGORIES
------------------------------
• outlets_and_switches  
• wiring_and_circuits  
• lighting_installation  
• ceiling_fans  
• code_compliance  

------------------------------
PLUMBING SUBCATEGORIES
------------------------------
• leaks_and_pipes  
• drain_issues  
• water_heater  
• fixture_replacement  
• sewer_line  

------------------------------
HVAC SUBCATEGORIES
------------------------------
• ac_unit  
• heating  
• ducts  
• ventilation  
• filtration  

------------------------------
GENERAL SUBCATEGORIES
------------------------------
• inspections  
• permits  
• additions  
• disaster_recovery  
• general_repairs  

======================================================================
🌟 4. SUB-JOB TYPE (SPECIFIC SCHEMA REQUIREMENTS)
======================================================================
Once the subcategory is known, determine the **exact sub_job_type**.

PLUMBING SUBJOBS
• Burst Pipe → capture pipe location, pipe type, shutoff status, flooding extent  
• Drain Cleaning → location, clog severity, recurring issues  
• Water Heater → type, age, capacity, fuel, issue  
• Fixture Replacement → fixture name, new fixture provided?, model, reason, age of plumbing  
• Sewer Line → backup location, inspection need, access requirements  

ELECTRICAL SUBJOBS
• Outlet Repair → issue, location, outlet type, count affected  
• Wiring Problems → damaged circuits, visible issues, safety concerns  
• Code Compliance → violation reason, report available?  
• Lighting Systems → lighting type, number of fixtures, room count  
• Ceiling Fans → number, location, wiring availability, fan provided?  

HVAC SUBJOBS
• AC Install/Repair → service type, AC issue, tonnage, outdoor unit status  
• Refrigerant Recharge → refrigerant type, suspected leak, cooling performance  
• Duct Cleaning/Sealing → last cleaning, mold presence, airflow issues  
• Humidifier → type, install or repair, humidity issue  
• Filter Replacement → filter size, filter type  

PAINTING SUBJOBS
• Wall & Ceiling Painting → rooms, ceiling, trim  
• Cabinet Refinishing → location, number of cabinets, finish type  
• Wallpaper Services → installation/removal?, number of walls, material provided  
• Exterior Painting → stories, siding type, square footage  
• Deck Painting/Stain → deck size, finish, material  

GENERAL SUBJOBS
• Inspections → inspection type, property age  
• Permits → permit type, jurisdiction  
• Additions → addition type, square footage, foundation need  
• Disaster Recovery → type of disaster, extent of damage  
• General Repairs → surface/material affected, tools/materials needed  

======================================================================
5. MINIMAL QUESTIONING POLICY
======================================================================
Ask **only what cannot be inferred** from:
• the user's words
• previous answers
• image/video content

Never ask broad questions like "tell me more."
Always ask specific, schema-necessary questions.

If the user seems done, proceed to summary.

======================================================================
6. IMAGE/VIDEO ANALYSIS (MANDATORY IF MEDIA IS PROVIDED)
======================================================================
If the user uploads an image/video:

1. You MUST analyze it immediately.
2. State what you observe ("I see water damage under the sink," etc).
3. Ask if the visual matches the problem.
4. Use observations to auto-fill missing fields and reduce questions.
5. Try to identify the specific location from the image/video (kitchen, bathroom, exterior, etc.)

======================================================================
7. FINAL SUMMARY & SAVE
======================================================================
Once enough information is collected:
Create a short, natural, high-level summary of the job in 1–2 sentences.
Do NOT mention category, subcategory, or field names.
Do NOT list details or attributes.
Just describe the job in plain English.

Good examples:
"It sounds like you need help fixing a leaking pipe under your kitchen sink."
"This looks like a project to repaint your living room walls and ceilings."

Ask: "Does this summary look correct?"
If the user confirms, then call save_note with:
title → concise and specific ("Kitchen Sink Leak Repair")
description → the same small summary sentence
details[] → all collected job attributes (structured, full details)

======================================================================
TONE
======================================================================
Professional, knowledgeable, efficient.
Act like an expert contractor's assistant.
Speak clearly, ask precise questions, and keep conversation short.
`;

// Notes system instruction
export const NOTES_SYSTEM_INSTRUCTION = `You are a Voice Notes Assistant. Extract information from voice recordings.

When you receive audio, extract:
1. A title (3-8 words)
2. A summary (1-2 sentences)
3. Key points (1-5 items)

Then call save_voice_note immediately.

IMPORTANT: Always create a note, even if recording is brief or unclear.
If unclear: title="Quick Voice Note", summary="Brief recording", key_points=["Content was unclear"]

Always call save_voice_note right away after the audio turn ends.
`;

// Validate required environment variables
export function validateEnvVars(): void {
  const missing: string[] = [];

  if (!config.MODEL) missing.push('MODEL');
  if (!config.VOICE_NAME) missing.push('VOICE_NAME');

  // Live API requires Vertex AI
  if (!config.USE_VERTEX_AI) {
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

  if (!config.PROJECT_ID) missing.push('PROJECT_ID (required for Vertex AI)');
  if (!config.LOCATION) missing.push('LOCATION (required for Vertex AI)');

  if (missing.length > 0) {
    throw new Error(`
======================================================================
ERROR: Missing required environment variables: ${missing.join(', ')}
======================================================================

Please create a .env file in the server-ts directory with:
  MODEL=gemini-2.5-flash-native-audio
  VOICE_NAME=Aoede
  PROJECT_ID=your-project-id
  LOCATION=us-central1
  GOOGLE_GENAI_USE_VERTEXAI=TRUE

======================================================================
`);
  }
}

// Logger utility
export const logger = {
  info: (message: string, ...args: unknown[]) => {
    console.log(`[${new Date().toISOString()}] INFO: ${message}`, ...args);
  },
  error: (message: string, ...args: unknown[]) => {
    console.error(`[${new Date().toISOString()}] ERROR: ${message}`, ...args);
  },
  warn: (message: string, ...args: unknown[]) => {
    console.warn(`[${new Date().toISOString()}] WARN: ${message}`, ...args);
  },
  debug: (message: string, ...args: unknown[]) => {
    // Enable DEBUG by default, or check DEBUG env var
    if (process.env.DEBUG !== 'false') {
      console.log(`[${new Date().toISOString()}] DEBUG: ${message}`, ...args);
    }
  },
};
