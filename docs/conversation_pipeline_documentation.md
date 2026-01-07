# Conversation Pipeline Documentation

## Overview

The `conversation_pipeline.py` module implements an advanced job extraction pipeline that uses Google's Vertex AI (Gemini) to extract structured job data from natural language descriptions. This pipeline is designed for home repair job intake systems, converting conversational job descriptions into structured, actionable data that can be stored and processed.

## Core Purpose

The pipeline serves as an AI-powered data extraction system that:

- Analyzes job description text using Google's Gemini AI model with category identification
- Extracts structured information using category-specific schemas and subjob types
- Validates extracted data using Pydantic models with detailed validation
- Saves job data to individual JSON files with deduplication
- Integrates with note-taking systems for automated job capture
- Supports complex job categorization and detailed subjob specifications

## Key Components

### 1. Data Schemas (Pydantic Models)

The pipeline uses comprehensive schemas defined in `schema.py` and `subjob_schema.py`:

#### Base Job Categories

- **Job**: Base job model with common fields
- **PaintingJob**: Painting-specific job model
- **ElectricalJob**: Electrical-specific job model
- **PlumbingJob**: Plumbing-specific job model
- **HVACJob**: HVAC-specific job model
- **GeneralJob**: General repair job model

#### Subjob Types

Detailed subjob models for specific job types:

**Plumbing Subjobs:**

- BurstPipeJob
- DrainCleaningJob
- WaterHeaterJob
- FixtureReplacementJob
- SewerLineJob

**Electrical Subjobs:**

- OutletRepairJob
- WiringProblemsJob
- CodeComplianceJob
- LightingSystemsJob
- CeilingFanJob

**HVAC Subjobs:**

- ACInstallationRepairJob
- RefrigerantRechargingJob
- DuctCleaningJob
- HumidifierJob
- FilterReplacementJob

**Painting Subjobs:**

- WallCeilingPaintingJob
- CabinetRefinishingJob
- WallpaperServicesJob
- ExteriorHousePaintingJob
- DeckPaintingJob

**General Subjobs:**

- InspectionsJob
- PermitProcurementJob
- HomeAdditionsJob
- DisasterRecoveryJob

### 2. JobExtractor Class

Main extraction engine that interfaces with Vertex AI using a two-phase approach.

#### `__init__()`

Initializes the extractor with:

- Vertex AI client configured with project and location
- Model specification (defaults to "gemini-2.5-flash")
- Asyncio lock for thread safety

#### `_identify_category(text: str) -> str`

**Purpose**: First-phase analysis to identify the job category.

**Process**:

1. Sends job text to AI for category identification
2. Returns one of: "plumbing", "electrical", "hvac", "painting", "general"
3. Falls back to "general" on errors

#### `_get_subjob_examples(category: str) -> str`

**Purpose**: Provides category-specific subjob examples and field requirements.

**Features**:

- Contains detailed examples for each subjob type
- Includes field descriptions and validation rules
- Helps AI generate accurate, category-appropriate responses

#### `_get_category_base_fields(category: str) -> str`

**Purpose**: Returns category-specific base fields that should always be included.

**Categories**:

- Plumbing: issue_type, fixture_type, severity, water_damage, etc.
- Electrical: installation_type, number_of_outlets, voltage_requirement, etc.
- HVAC: system_type, issue_type, system_age, etc.
- Painting: number_of_rooms, ceiling_height, paint_colors, etc.
- General: work_type, materials_needed, estimated_scope, etc.

#### `_build_extraction_prompt(text: str, category: str) -> str`

**Purpose**: Constructs detailed AI prompt for job extraction.

**Features**:

- Includes category-specific base fields
- Provides subjob type examples
- Specifies required JSON structure
- Includes validation rules and field requirements

#### `extract_from_text(job_text: str) -> Optional[Union[Job, DetailedJob]]`

**Purpose**: Main extraction method that processes natural language job descriptions.

**Process**:

1. Identifies job category using `_identify_category()`
2. Builds category-specific extraction prompt
3. Calls Vertex AI Gemini model asynchronously
4. Parses JSON response safely
5. Validates with appropriate Pydantic model
6. Returns validated Job or DetailedJob object

**Error Handling**: Returns None on extraction failures.

#### `_safe_json_parse(raw: str) -> Optional[dict]`

**Purpose**: Robustly parses JSON from AI responses.

**Features**:

- Handles direct JSON responses
- Extracts JSON from markdown code blocks
- Finds JSON object boundaries
- Comprehensive error logging and fallback handling

#### `_validate_job(job_data: dict) -> Optional[Job]`

**Purpose**: Validates job data against appropriate Pydantic models.

**Process**:

1. Attempts validation with subjob-specific models first
2. Falls back to base category models if subjob validation fails
3. Returns validated Job object or None on failure

#### `save_to_individual_file(job: Union[Job, DetailedJob], session_id: str, user_id: str = 'anon') -> Optional[str]`

**Purpose**: Thread-safe saving of extracted jobs to individual JSON files.

**Features**:

- Checks for duplicate jobs by title matching
- Generates unique job IDs using SHA256 hashing
- Creates sanitized filenames
- Sets job metadata (IDs, timestamps)
- Saves to individual files in conversation_data directory

**Deduplication Logic**:

- Exact title matching (case-insensitive)
- Fuzzy matching for similar titles (>5 characters)
- Prevents duplicate entries while allowing similar but distinct jobs

#### `_sanitize_filename(title: str, job_id: str) -> str`

**Purpose**: Creates safe filenames from job titles and IDs.

**Format**: `job_{job_id}_{sanitized_title}.json`

#### `_job_file_exists(title: str) -> bool`

**Purpose**: Checks if a job with similar title already exists in the data directory.

#### `_generate_job_id() -> str`

**Purpose**: Creates unique 12-character job IDs using timestamp-based SHA256 hashing.

#### `get_all_jobs() -> List[dict]`

**Purpose**: Retrieves all job files and returns as a sorted list.

**Features**:

- Reads all job JSON files from conversation_data directory
- Sorts by created_at timestamp (newest first)
- Returns list of job dictionaries

#### `get_job_by_id(job_id: str) -> Optional[dict]`

**Purpose**: Retrieves a specific job by its unique ID.

#### `delete_job(job_id: str) -> bool`

**Purpose**: Deletes a job file by its ID.

### 3. JobSummaryTracker Class

Integration layer that connects the extraction system with note-taking workflows and cloud storage.

#### `__init__()`

Initializes tracker with:

- JobExtractor instance
- Dictionary to track pending extraction tasks
- Azure Blob Storage client for cloud backup of job schemas

#### `extract_and_save_from_note(session_id: str, title: str, description: str, details: List[str], user_id: str = 'anon') -> Optional[str]`

**Purpose**: Primary integration method called when notes are saved, with automatic cloud backup.

**Process**:

1. Combines note components (title, description, details) into job text
2. Extracts structured data using JobExtractor
3. Saves to individual JSON file
4. Uploads job schema to Azure Blob Storage for backup and sharing
5. Returns filepath on success, None on failure

**Input Format**: Expects data from `save_note_tool` triggers.

**Cloud Storage**: Automatically uploads extracted job schemas to Azure Blob Storage with session-specific naming for distributed access.

## Configuration

The pipeline uses environment variables for configuration:

- `MODEL`: AI model to use (default: "gemini-2.5-flash")
- `PROJECT_ID`: Google Cloud project ID
- `LOCATION`: Google Cloud region

Output configuration:

- `OUTPUT_DIR`: "conversation_data" (created automatically)
- Individual job files: `job_{id}_{title}.json`

## Integration Points

### With Note-Taking System

- Triggered by `save_note_tool` events
- Processes note data into structured job information
- Supports session and user ID tracking

### With File System

- Reads/writes individual job files to `conversation_data/` directory
- Thread-safe operations using asyncio locks
- Automatic directory creation
- Filename sanitization for safe storage

### With Google Cloud Vertex AI

- Uses `google.genai.Client` for AI interactions
- Two-phase extraction: category identification + detailed extraction
- Asynchronous processing for non-blocking operations
- Category-specific prompt engineering for consistent results

### With Azure Blob Storage

- Automatic backup of extracted job schemas to cloud storage
- Session-based file naming for organized storage
- Error handling for storage failures without affecting local processing
- Enables distributed access to job data across multiple systems

## Error Handling

The pipeline implements comprehensive error handling:

- AI extraction failures return None
- JSON parsing errors are logged and handled gracefully
- File I/O errors are caught and logged
- Thread safety prevents race conditions
- Detailed logging for debugging
- Validation errors fall back to base models

## Example Usage

```python
# Initialize tracker
tracker = JobSummaryTracker()

# Extract from note data
filepath = await tracker.extract_and_save_from_note(
    session_id="session_123",
    title="Fix Kitchen Faucet",
    description="Kitchen faucet is leaking constantly",
    details=["Constant drip", "Located under sink", "Need plumber"],
    user_id="user_456"
)

if filepath:
    print(f"Job saved to: {filepath}")
```

## Output Format

Jobs are saved as individual JSON files with the following structure:

```json
{
  "job_id": "abc123def456",
  "session_id": "session_123",
  "user_id": "user_456",
  "category": "plumbing",
  "title": "Fix Kitchen Faucet",
  "description": "Kitchen faucet is leaking constantly",
  "location_type": "indoor",
  "specific_location": "Kitchen",
  "urgency": "medium",
  "complexity": "basic",
  "estimated_duration_minutes": 60,
  "problem_type": "Leak",
  "customer_notes": null,
  "tools_needed": "Pipe wrench, plumber's tape",
  "key_details": ["Constant drip", "Located under sink"],
  "has_images": false,
  "has_video": false,
  "sub_job_type": "Fixture Replacement",
  "fixture_to_replace": "Faucet",
  "new_fixture_provided": false,
  "reason_for_replacement": "Leaking",
  "created_at": "2024-01-01T00:00:00.000000",
  "last_updated": "2024-01-01T00:00:00.000000"
}
```

## Dependencies

- `pydantic`: Data validation and serialization
- `google.genai`: Vertex AI client library
- `asyncio`: Asynchronous processing
- `json`: JSON handling
- `pathlib`: Path operations
- `datetime`: Timestamp generation
- `hashlib`: ID generation
- `logging`: Structured logging
- `blob_storage.py`: Azure Blob Storage integration
- `schema.py`: Job schema definitions
- `subjob_schema.py`: Detailed subjob schema definitions

## Security Considerations

- No sensitive data logging
- Thread-safe file operations
- Input validation through Pydantic models
- Safe JSON parsing to prevent injection attacks
- Filename sanitization prevents path traversal
- User ID and session ID tracking for audit trails
