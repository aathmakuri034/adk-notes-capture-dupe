# Package Installation Guide

This document covers how to install the `adk-notes-capture-agent` Python package from the private GitHub repository and use it in your projects.

## Prerequisites

| Requirement | Details |
|-------------|---------|
| Python | 3.10 or higher |
| Git | Required for pip to clone the repository |
| Repository Access | SSH key or personal access token with read access |

---

## Installation

### Option 1: SSH (Recommended)

Requires SSH keys configured with GitHub access to the repository.

```bash
pip install git+ssh://git@github.com:aathmakuri034/adk-notes-capture-dupe.git@python-packaged
```

### Option 2: HTTPS with Personal Access Token

Use this method if SSH is not configured. Create a [personal access token](https://github.com/settings/tokens) with `repo` scope.

```bash
pip install git+https://<TOKEN>@github.com/aathmakuri034/adk-notes-capture-dupe.git@python-packaged
```

### Adding to requirements.txt

```text
# SSH
git+ssh://git@github.com:aathmakuri034/adk-notes-capture-dupe.git@python-packaged
```

For HTTPS in CI/CD pipelines, use environment variable substitution:

```text
git+https://<TOKEN>@github.com/aathmakuri034/adk-notes-capture-dupe.git@python-packaged
```

---

## Package Structure

The package is installed as `adk_notes_capture_agent` and provides the following modules:

| Module | Description |
|--------|-------------|
| `schema` | Pydantic models for job types (Painting, Electrical, Plumbing, HVAC, General) |
| `subjob_schema` | Detailed subjob models for specialized work types |
| `streaming_service` | WebSocket streaming service for voice assistant |
| `notes_streaming_service` | Voice notes capture service |
| `conversation_pipeline` | Job extraction pipeline using Vertex AI |
| `blob_storage` | Azure Blob Storage integration |
| `database` | SQLite/database utilities |
| `core_utils` | Shared utilities and configuration |

---

## Usage

### Basic Imports

```python
# Import main classes directly
from adk_notes_capture_agent import StreamingService
from adk_notes_capture_agent import NotesStreamingService
from adk_notes_capture_agent import JobSummaryTracker
from adk_notes_capture_agent import AzureBlobStorage

# Import schema models
from adk_notes_capture_agent.schema import (
    Job,
    PaintingJob,
    ElectricalJob,
    PlumbingJob,
    HVACJob,
    GeneralJob,
    JobCategory,
    UrgencyLevel,
)

# Import subjob models
from adk_notes_capture_agent.subjob_schema import (
    BurstPipeJob,
    WiringProblemsJob,
    ACInstallationRepairJob,
)
```

### Working with Job Models

```python
from adk_notes_capture_agent.schema import (
    PlumbingJob,
    JobCategory,
    UrgencyLevel,
    LocationType,
    ComplexityLevel,
)

# Create a job instance
job = PlumbingJob(
    category=JobCategory.PLUMBING,
    title="Kitchen Sink Leak Repair",
    description="Leaking pipe under kitchen sink causing water damage",
    location_type=LocationType.INDOOR,
    specific_location="Kitchen",
    urgency=UrgencyLevel.HIGH,
    complexity=ComplexityLevel.INTERMEDIATE,
    estimated_duration_minutes=60,
    problem_type="leak",
    key_details=["Active leak", "Water damage visible"],
)

# Serialize to JSON
job_json = job.model_dump_json()

# Validate from dict
job_data = {"category": "plumbing", "title": "...", ...}
validated_job = PlumbingJob.model_validate(job_data)
```

### Using the Job Extraction Pipeline

```python
from adk_notes_capture_agent.conversation_pipeline import JobSummaryTracker

# Initialize the tracker
tracker = JobSummaryTracker(session_id="unique-session-id")

# Process conversation transcript
await tracker.process_transcript(transcript_text)

# Get extracted job data
job_summary = tracker.get_summary()
```

### Azure Blob Storage

```python
from adk_notes_capture_agent.blob_storage import AzureBlobStorage

# Initialize storage client
storage = AzureBlobStorage(
    connection_string="your-connection-string",
    container_name="jobs" # Or what ever your container name is
)

# Upload job data
await storage.upload_job(job_id="123", job_data=job.model_dump())

# Retrieve job data
job_data = await storage.get_job(job_id="123")
```

---

## Environment Variables

The package expects certain environment variables for full functionality:

| Variable | Required | Description |
|----------|----------|-------------|
| `PROJECT_ID` | Yes | Google Cloud project ID |
| `LOCATION` | Yes | Google Cloud region (e.g., `us-central1`) |
| `MODEL` | Yes | Gemini model name |
| `VOICE_NAME` | Yes | Voice synthesis name |
| `GOOGLE_GENAI_USE_VERTEXAI` | Yes | Set to `TRUE` for Vertex AI |
| `AZURE_STORAGE_CONNECTION_STRING` | For blob storage | Azure connection string |

Create a `.env` file or set these in your environment before importing modules that require them.

---

## Troubleshooting

**Import errors after installation**

Ensure you're using the correct package name with underscores:
```python
# Correct
from adk_notes_capture_agent import StreamingService

# Incorrect
from adk-notes-capture-agent import StreamingService
```

**Authentication errors with Google Cloud**

The package requires Vertex AI authentication. Ensure `GOOGLE_APPLICATION_CREDENTIALS` points to a valid service account key, or run within an authenticated Google Cloud environment.

**SSH installation fails**

Verify your SSH key is added to the ssh-agent:
```bash
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519
ssh -T git@github.com  # Test connection
```
