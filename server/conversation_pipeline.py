"""
Job Extraction Pipeline using Vertex AI with Your JSON Schema
Extracts structured job data using your existing schema and prompt
"""

import json
import os
import asyncio
from datetime import datetime as dt
from typing import Dict, List, Optional
from pathlib import Path
from enum import Enum

# Pydantic v2 imports
from pydantic import BaseModel, Field, field_validator, ConfigDict
from google.genai import Client
import google.genai.types as types
import logging

# Set up logging
logger = logging.getLogger(__name__)

# Configuration
OUTPUT_DIR = "conversation_data"
OUTPUT_FILE = "job_metadata.json"
MODEL = os.getenv("MODEL", "gemini-2.5-flash")
PROJECT_ID = os.getenv("PROJECT_ID")
LOCATION = os.getenv("LOCATION")

Path(OUTPUT_DIR).mkdir(exist_ok=True)
JOB_METADATA_PATH = os.path.join(OUTPUT_DIR, OUTPUT_FILE)

# ============================================================================
# PYDANTIC SCHEMAS (Matching Your JSON Structure)
# ============================================================================

class UrgencyLevel(str, Enum):
    """Job urgency levels"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ComplexityLevel(str, Enum):
    """Job complexity levels"""
    BASIC = "basic"
    INTERMEDIATE = "intermediate"
    COMPLEX = "complex"


class JobCategory(str, Enum):
    """Job categories"""
    PAINTING = "Painting"
    ELECTRICAL = "Electrical"
    PLUMBING = "Plumbing"
    HVAC = "HVAC"
    DRYWALL = "Drywall"
    GENERAL = "General"


class JobMetadata(BaseModel):
    """Job metadata matching exact schema"""
    model_config = ConfigDict(populate_by_name=True)
    
    estimated_duration_minutes: int = Field(..., ge=0, description="Duration in minutes")
    urgency: UrgencyLevel
    location_context: str
    job_category: JobCategory
    problem_type: str
    complexity: ComplexityLevel
    tools_needed: Optional[str] = Field(None, alias="tools needed")
    communication_preference: Optional[str] = Field(None, alias="communication preference")
    key_details: List[str] = Field(default_factory=list)


class JobAnalysis(BaseModel):
    """Single job analysis matching your schema"""
    title: str = Field(..., min_length=1)
    summary: str = Field(..., min_length=1)
    metadata: JobMetadata

    @field_validator('title')
    @classmethod
    def clean_title(cls, v: str) -> str:
        return v.strip()

    @field_validator('summary')
    @classmethod
    def clean_summary(cls, v: str) -> str:
        return v.strip()


class JobList(BaseModel):
    """List of job analyses"""
    jobs: List[JobAnalysis] = Field(default_factory=list)

    @classmethod
    def from_list(cls, job_list: List[dict]) -> "JobList":
        """Create from a list of dicts"""
        if isinstance(job_list, list):
            return cls(jobs=job_list)
        return cls(jobs=[])


# ============================================================================
# EXTRACTOR CLASS
# ============================================================================

class JobExtractor:
    """Extracts structured job data using Vertex AI"""
    
    def __init__(self):
        """Initialize Vertex AI client"""
        self.client = Client(
            vertexai=True,
            project=PROJECT_ID,
            location=LOCATION
        )
        self.model = MODEL
        self.lock = asyncio.Lock()
    
    def _build_extraction_prompt(self, text: str) -> str:
        """Build prompt using your exact format"""
        prompt = f"""Analyze the following job description text.
            Extract structured information about the job being discussed.
            Return NOTHING else except for the JSON information.

            JOB DESCRIPTION:
            {text}

            Please analyze this job description and return a JSON array with exactly ONE job object using this EXACT structure:

            [
            {{
            "title": "string (brief descriptive title like 'Fix Leaking Faucet')",
            "summary": "string (one sentence summary of the issue)",
            "metadata": {{
                "estimated_duration_minutes": number (required field),
                "urgency": "low/medium/high" (required field),
                "location_context": "string (specific location like 'Kitchen', 'Master Bathroom')",
                "job_category": "Painting/Electrical/Plumbing/HVAC/Drywall/General",
                "problem_type": "string (specific problem like 'Leak', 'Installation', 'Repair')",
                "complexity": "basic/intermediate/complex" (required field),
                "tools needed": "Power tools / common handtools",
                "communication preference": "string (call, text, email)",
                "key_details": [
                "string (each important detail as a separate item)",
                "string (e.g., 'Faucet leak', 'Constant drip')"
                ]
            }}
            }}
            ]

            Return ONLY the JSON array, no additional text or markdown."""
        return prompt
    
    async def extract_from_text(self, job_text: str) -> JobList:
        """
        Extract structured job data from job description text.
        
        Args:
            job_text: Natural language description of the job
            
        Returns:
            Validated JobList object
        """
        user_prompt = self._build_extraction_prompt(job_text)
        
        system_message = """
            You are a JSON extraction engine for home repair job intake.
            You never greet users.
            You never act conversationally.
            You ONLY output structured JSON arrays that match the required schema.
            Extract all relevant details from the job description.
            Be precise and factual.
            Never output markdown code blocks.
        """

        try:
            # Call Vertex AI
            response = await asyncio.to_thread(
                self.client.models.generate_content,
                model=self.model,
                contents=[
                    types.Content(
                        role="user",
                        parts=[types.Part(text=f"{system_message}\n\n{user_prompt}")]
                    )
                ]
            )
            
            raw = response.text.strip()
            logger.info(f"Raw extraction response length: {len(raw)} chars")
            
            # Parse JSON
            parsed = self._safe_json_parse(raw)
            
            # Validate with Pydantic
            job_list = JobList.from_list(parsed)
            logger.info(f"Successfully extracted {len(job_list.jobs)} job(s)")
            
            return job_list
            
        except Exception as e:
            logger.error(f"Error extracting job data: {e}")
            # Return empty list on error
            return JobList(jobs=[])
    
    def _safe_json_parse(self, raw: str) -> list:
        """Safely parse JSON from LLM response"""
        try:
            parsed = json.loads(raw)
            # Ensure it's a list
            if not isinstance(parsed, list):
                parsed = [parsed]
            return parsed
        except json.JSONDecodeError:
            # Try to extract JSON from markdown code blocks
            try:
                if "```json" in raw:
                    raw = raw.split("```json")[1].split("```")[0].strip()
                elif "```" in raw:
                    raw = raw.split("```")[1].split("```")[0].strip()
                
                # Try to find JSON array boundaries
                start = raw.index("[")
                end = raw.rindex("]") + 1
                cleaned = raw[start:end]
                parsed = json.loads(cleaned)
                
                if not isinstance(parsed, list):
                    parsed = [parsed]
                return parsed
            except Exception as e:
                logger.error(f"Failed to parse JSON: {e}")
                logger.error(f"Raw response:\n{raw}")
                return []
    
    async def save_to_json(
        self,
        job_list: JobList,
        conversation_turns: int = 0
    ) -> str:
        """
        Save extracted jobs to job_metadata.json file.
        Thread-safe with deduplication.
        """
        if not job_list.jobs:
            logger.info("No jobs to save")
            return JOB_METADATA_PATH
        
        async with self.lock:
            # Read existing data
            existing_data = self._read_job_metadata()
            
            # Build set of existing job titles for deduplication
            existing_titles = {job["title"].lower().strip() for job in existing_data["jobs"]}
            
            jobs_added = 0
            for job_analysis in job_list.jobs:
                title = job_analysis.title.strip()
                title_lower = title.lower()
                
                # Check for exact duplicate
                if title_lower in existing_titles:
                    logger.info(f"Skipping duplicate job title: '{title}'")
                    continue
                
                # Check for fuzzy duplicates
                is_duplicate = False
                for existing_title in existing_titles:
                    if (title_lower in existing_title or existing_title in title_lower) and \
                       len(title_lower) > 5:
                        logger.info(f"Skipping similar job title: '{title}' (similar to: '{existing_title}')")
                        is_duplicate = True
                        break
                
                if is_duplicate:
                    continue
                
                # Convert to your exact JSON structure
                new_job = {
                    "id": self._generate_job_id(),
                    "title": job_analysis.title,
                    "summary": job_analysis.summary,
                    "metadata": job_analysis.metadata.model_dump(by_alias=True, exclude_none=False),
                    "created_at": dt.now().isoformat(),
                    "conversation_turns": conversation_turns
                }
                
                existing_data["jobs"].append(new_job)
                existing_titles.add(title_lower)
                jobs_added += 1
            
            # Only update file if we actually added jobs
            if jobs_added > 0:
                existing_data["total_jobs"] = len(existing_data["jobs"])
                existing_data["last_updated"] = dt.now().isoformat()
                self._write_job_metadata(existing_data)
                logger.info(f"Added {jobs_added} new job(s) to {JOB_METADATA_PATH}")
            else:
                logger.info("No new jobs added (all were duplicates)")
            
            return JOB_METADATA_PATH
    
    def _generate_job_id(self) -> str:
        """Generate unique job ID"""
        import hashlib
        timestamp = dt.now().isoformat()
        return hashlib.sha256(timestamp.encode()).hexdigest()[:12]
    
    def _read_job_metadata(self) -> dict:
        """Read job metadata file"""
        if os.path.exists(JOB_METADATA_PATH):
            try:
                with open(JOB_METADATA_PATH, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except json.JSONDecodeError:
                logger.warning(f"Invalid JSON in {JOB_METADATA_PATH}, recreating...")
        
        return {
            "version": "1.0",
            "created_at": dt.now().isoformat(),
            "last_updated": dt.now().isoformat(),
            "total_jobs": 0,
            "jobs": []
        }
    
    def _write_job_metadata(self, data: dict):
        """Write job metadata file"""
        with open(JOB_METADATA_PATH, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)


# ============================================================================
# INTEGRATION TRACKER
# ============================================================================

class JobSummaryTracker:
    """
    Tracks job summaries and extracts structured data.
    Call this when save_note_tool is triggered.
    """
    
    def __init__(self):
        self.extractor = JobExtractor()
        self.pending_extractions: Dict[str, asyncio.Task] = {}
    
    async def extract_and_save_from_note(
        self,
        session_id: str,
        title: str,
        description: str,
        details: List[str],
        conversation_turns: int = 0
    ) -> Optional[str]:
        """
        Extract job from note data and save it.
        
        Args:
            session_id: Session identifier
            title: Job title from save_note_tool
            description: Job description from save_note_tool
            details: List of key details from save_note_tool
            conversation_turns: Number of conversation turns
            
        Returns:
            filepath if successful, None otherwise
        """
        try:
            # Build job text from note components
            job_text = f"""
                Title: {title}

                Description: {description}

                Key Details:
                {chr(10).join(f"- {detail}" for detail in details)}
            """
            
            logger.info(f"Extracting structured data for: {title}")
            
            # Extract structured data
            job_list = await self.extractor.extract_from_text(job_text)
            
            if not job_list.jobs:
                logger.warning(f"No jobs extracted from note: {title}")
                return None
            
            # Save to JSON with your schema
            filepath = await self.extractor.save_to_json(
                job_list,
                conversation_turns=conversation_turns
            )
            
            logger.info(f"Successfully saved structured job data: {title}")
            return filepath
            
        except Exception as e:
            logger.error(f"Error extracting job for session {session_id}: {e}")
            import traceback
            traceback.print_exc()
            return None


# ============================================================================
# EXAMPLE USAGE
# ============================================================================

async def example_extraction():
    """Example of extracting a job"""
    
    tracker = JobSummaryTracker()
    
    # Example note data (from save_note_tool)
    title = "Install French Drain"
    description = "Installation of a 10-foot French drain on a hillside in the backyard to redirect water to a specific runoff area."
    details = [
        "10-foot French drain",
        "Installed on hillside",
        "Redirecting water to a specific runoff area",
        "Location: Backyard"
    ]
    
    # Extract and save
    filepath = await tracker.extract_and_save_from_note(
        session_id="test_123",
        title=title,
        description=description,
        details=details,
        conversation_turns=6
    )
    
    if filepath:
        print("\n" + "="*60)
        print("EXTRACTION SUCCESSFUL")
        print("="*60)
        print(f"Saved to: {filepath}")
        
        # Show the result
        with open(filepath, 'r') as f:
            data = json.load(f)
            if data["jobs"]:
                print("\nExtracted Job:")
                print(json.dumps(data["jobs"][-1], indent=2))


if __name__ == "__main__":
    asyncio.run(example_extraction())