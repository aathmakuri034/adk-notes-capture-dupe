# Conversation Pipeline Documentation

## Overview

The `conversation_pipeline.py` module implements a job extraction pipeline that uses Google's Vertex AI (Gemini) to extract structured job data from natural language descriptions. This pipeline is designed for home repair job intake systems, converting conversational job descriptions into structured, actionable data that can be stored and processed.

## Core Purpose

The pipeline serves as an AI-powered data extraction system that:

- Analyzes job description text using Google's Gemini AI model
- Extracts structured information using predefined schemas
- Validates extracted data using Pydantic models
- Saves job data to JSON files with deduplication
- Integrates with note-taking systems for automated job capture

## Key Components

### 1. Data Schemas (Pydantic Models)

#### Enums

**`UrgencyLevel`**

- Defines job urgency levels: `LOW`, `MEDIUM`, `HIGH`
- Used to prioritize jobs based on time sensitivity

**`ComplexityLevel`**

- Defines job complexity: `BASIC`, `INTERMEDIATE`, `COMPLEX`
- Helps estimate required skill level and time

**`JobCategory`**

- Categorizes jobs into: `PAINTING`, `ELECTRICAL`, `PLUMBING`, `HVAC`, `DRYWALL`, `GENERAL`
- Enables proper routing to appropriate contractors

#### Data Models

**`JobMetadata`**
Core metadata structure containing:

- `estimated_duration_minutes`: Integer representing job duration in minutes (required, ≥0)
- `urgency`: Urgency level enum (required)
- `location_context`: Specific location string (e.g., "Kitchen", "Master Bathroom")
- `job_category`: Job category enum (required)
- `problem_type`: Specific problem description (e.g., "Leak", "Installation")
- `complexity`: Complexity level enum (required)
- `tools_needed`: Optional string describing required tools
- `communication_preference`: Optional string for preferred contact method
- `key_details`: List of important detail strings

**`JobAnalysis`**
Represents a single extracted job with:

- `title`: Brief descriptive title (required, min length 1)
- `summary`: One-sentence summary of the issue (required, min length 1)
- `metadata`: JobMetadata object

**`JobList`**
Container for multiple job analyses:

- `jobs`: List of JobAnalysis objects
- Includes factory method `from_list()` for creating from dictionaries

### 2. JobExtractor Class

Main extraction engine that interfaces with Vertex AI.

#### `__init__()`

Initializes the extractor with:

- Vertex AI client configured with project and location
- Model specification (defaults to "gemini-2.5-flash")
- Asyncio lock for thread safety

#### `_build_extraction_prompt(text: str) -> str`

Private method that constructs the AI prompt for job extraction. Creates a detailed prompt that instructs the AI to:

- Analyze job description text
- Return JSON in exact schema format
- Extract specific fields with validation rules

#### `extract_from_text(job_text: str) -> JobList`

**Purpose**: Main extraction method that processes natural language job descriptions.

**Process**:

1. Builds extraction prompt with job text
2. Calls Vertex AI Gemini model asynchronously
3. Parses JSON response safely
4. Validates with Pydantic models
5. Returns JobList object

**Error Handling**: Returns empty JobList on extraction failures.

#### `_safe_json_parse(raw: str) -> list`

**Purpose**: Robustly parses JSON from AI responses.

**Features**:

- Handles direct JSON responses
- Extracts JSON from markdown code blocks
- Finds JSON array boundaries
- Ensures list format output
- Comprehensive error logging

#### `save_to_json(job_list: JobList, conversation_turns: int = 0) -> str`

**Purpose**: Thread-safe saving of extracted jobs to JSON file with deduplication.

**Features**:

- Reads existing job metadata
- Performs exact and fuzzy deduplication based on titles
- Generates unique job IDs using SHA256 hash
- Updates file metadata (total jobs, last updated timestamp)
- Only writes file if new jobs are added

**Deduplication Logic**:

- Exact title matching (case-insensitive)
- Fuzzy matching for similar titles (>5 characters)
- Prevents duplicate entries while allowing similar but distinct jobs

#### `_generate_job_id() -> str`

**Purpose**: Creates unique 12-character job IDs using timestamp-based SHA256 hashing.

#### `_read_job_metadata() -> dict`

**Purpose**: Safely reads existing job metadata file, creates default structure if file doesn't exist or is corrupted.

#### `_write_job_metadata(data: dict)`

**Purpose**: Writes job metadata to JSON file with proper formatting (2-space indentation, UTF-8 encoding).

### 3. JobSummaryTracker Class

Integration layer that connects the extraction system with note-taking workflows.

#### `__init__()`

Initializes tracker with:

- JobExtractor instance
- Dictionary to track pending extraction tasks

#### `extract_and_save_from_note(session_id: str, title: str, description: str, details: List[str], conversation_turns: int = 0) -> Optional[str]`

**Purpose**: Primary integration method called when notes are saved.

**Process**:

1. Combines note components (title, description, details) into job text
2. Extracts structured data using JobExtractor
3. Saves to JSON file
4. Returns filepath on success, None on failure

**Input Format**: Expects data from `save_note_tool` triggers.

## Configuration

The pipeline uses environment variables for configuration:

- `MODEL`: AI model to use (default: "gemini-2.5-flash")
- `PROJECT_ID`: Google Cloud project ID
- `LOCATION`: Google Cloud region

Output configuration:

- `OUTPUT_DIR`: "conversation_data" (created automatically)
- `OUTPUT_FILE`: "job_metadata.json"

## Integration Points

### With Note-Taking System

- Triggered by `save_note_tool` events
- Processes note data into structured job information
- Maintains conversation context through turn counting

### With File System

- Reads/writes to `conversation_data/job_metadata.json`
- Thread-safe operations using asyncio locks
- Automatic directory creation

### With Google Cloud Vertex AI

- Uses `google.genai.Client` for AI interactions
- Asynchronous processing for non-blocking operations
- Structured prompt engineering for consistent results

## Error Handling

The pipeline implements comprehensive error handling:

- AI extraction failures return empty results
- JSON parsing errors are logged and handled gracefully
- File I/O errors recreate default structures
- Thread safety prevents race conditions
- Detailed logging for debugging

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
    conversation_turns=5
)

if filepath:
    print(f"Job saved to: {filepath}")
```

## Output Format

Jobs are saved in the following JSON structure:

```json
{
  "version": "1.0",
  "created_at": "2024-01-01T00:00:00.000000",
  "last_updated": "2024-01-01T00:00:00.000000",
  "total_jobs": 1,
  "jobs": [
    {
      "id": "abc123def456",
      "title": "Fix Kitchen Faucet",
      "summary": "Kitchen faucet is leaking constantly",
      "metadata": {
        "estimated_duration_minutes": 30,
        "urgency": "medium",
        "location_context": "Kitchen",
        "job_category": "Plumbing",
        "problem_type": "Leak",
        "complexity": "basic",
        "tools_needed": "Pipe wrench, plumber's tape",
        "communication_preference": "text",
        "key_details": ["Constant drip", "Located under sink"]
      },
      "created_at": "2024-01-01T00:00:00.000000",
      "conversation_turns": 5
    }
  ]
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

## Security Considerations

- No sensitive data logging
- Thread-safe file operations
- Input validation through Pydantic models
- Safe JSON parsing to prevent injection attacks
