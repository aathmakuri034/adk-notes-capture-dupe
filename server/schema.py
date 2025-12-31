from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Literal, Union
from datetime import datetime
from enum import Enum

# ============================================================================
# SHARED ENUMS
# ============================================================================

class JobCategory(str, Enum):
    """Job categories (lowercase for storage, title case for display)"""
    PAINTING = "painting"
    ELECTRICAL = "electrical"
    PLUMBING = "plumbing"
    HVAC = "hvac"
    GENERAL = "general"

class UrgencyLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    EMERGENCY = "emergency"

class LocationType(str, Enum):
    INDOOR = "indoor"
    OUTDOOR = "outdoor"
    BOTH = "both"

class ComplexityLevel(str, Enum):
    """Job complexity levels"""
    BASIC = "basic"
    INTERMEDIATE = "intermediate"
    COMPLEX = "complex"

# ============================================================================
# BASE JOB MODEL
# ============================================================================

class BaseJob(BaseModel):
    """Base model for all job types with common fields"""
    model_config = ConfigDict(populate_by_name=True)
    
    # Identifiers
    session_id: Optional[str] = Field(None, description="Unique identifier for the chat session")
    job_id: Optional[str] = Field(None, description="Unique identifier for the job")
    user_id: Optional[str] = Field(default = 'anon', description='Unique identifier for the user')
    
    # Core fields
    category: JobCategory
    title: str = Field(..., description="Brief title of the job")
    description: str = Field(..., description="High-level summary of the job")
    
    # Location
    location_type: LocationType
    specific_location: Optional[str] = Field(..., description="Room/area where work is needed")
    
    # Job metadata
    urgency: Optional[UrgencyLevel] = Field(default=UrgencyLevel.MEDIUM) # Need to make this a required field
    complexity: ComplexityLevel = Field(default=ComplexityLevel.INTERMEDIATE)
    estimated_duration_minutes: int = Field(..., ge=0, description="Estimated duration in minutes")
    problem_type: str = Field(..., description="Specific problem type")
    
    # Additional context
    customer_notes: Optional[str] = Field(None, description="Additional notes from customer")
    tools_needed: Optional[str] = Field(None, description="Tools required for the job")
    key_details: list[str] = Field(default_factory=list, description="Important details")
    
    # Media
    has_images: bool = Field(default=False)
    has_video: bool = Field(default=False)
    visual_analysis: Optional[str] = Field(None, description="AI analysis of provided images/videos")
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.now)
    last_updated: Optional[datetime] = Field(None)

# ============================================================================
# SPECIALIZED JOB MODELS
# ============================================================================

class PaintingJob(BaseJob):
    """Painting job with specialized fields"""
    category: Literal[JobCategory.PAINTING] = JobCategory.PAINTING
    
    # Room details
    number_of_rooms: Optional[int] = Field(None, ge=1, description="Number of rooms to paint")
    ceiling_height: Optional[float] = Field(None, description="Ceiling height in feet")
    room_size: Optional[str] = Field(None, description="Approximate room dimensions (e.g., '12x15 ft')")
    
    # Surface details
    number_of_walls: Optional[int] = Field(None, description="Total number of walls")
    number_of_doors: Optional[int] = Field(None, description="Number of doors to paint")
    number_of_windows: Optional[int] = Field(None, description="Number of windows to paint around")
    
    # Paint details
    paint_colors: Optional[list[str]] = Field(default_factory=list, description="Desired paint colors")
    surface_condition: Optional[str] = Field(None, description="Current condition of surfaces")
    prep_work_needed: Optional[str] = Field(None, description="Required prep work (patching, sanding, etc.)")

class ElectricalJob(BaseJob):
    """Electrical job with specialized fields"""
    category: Literal[JobCategory.ELECTRICAL] = JobCategory.ELECTRICAL
    
    # Work type
    installation_type: Optional[str] = Field(None, description="Type of electrical work (panel, outlet, EV charger, etc.)")
    
    # Electrical specs
    number_of_outlets: Optional[int] = Field(None, description="Number of outlets/plugs needed")
    voltage_requirement: Optional[str] = Field(None, description="Voltage requirement (e.g., 120V, 240V)")
    amperage: Optional[int] = Field(None, description="Required amperage")
    
    # Panel info
    has_existing_panel: Optional[bool] = Field(None, description="Whether there's an existing electrical panel")
    panel_capacity: Optional[str] = Field(None, description="Current panel capacity")
    
    # Location and wiring
    desired_location: Optional[str] = Field(None, description="Where the work should be performed")
    current_wiring: Optional[str] = Field(None, description="Description of current wiring situation")
    permits_required: Optional[bool] = Field(None, description="Whether permits are needed")

class PlumbingJob(BaseJob):
    """Plumbing job with specialized fields"""
    category: Literal[JobCategory.PLUMBING] = JobCategory.PLUMBING
    
    # Issue details
    issue_type: Optional[str] = Field(None, description="Type of plumbing issue (leak, clog, installation, etc.)")
    fixture_type: Optional[str] = Field(None, description="Type of fixture (sink, toilet, shower, etc.)")
    severity: Optional[str] = Field(None, description="Severity of the issue (minor, moderate, severe)")
    
    # Damage assessment
    water_damage: Optional[bool] = Field(default=False, description="Whether there's visible water damage")
    water_shut_off: Optional[bool] = Field(default=False, description="Whether water has been shut off")
    
    # Access and system
    access_difficulty: Optional[str] = Field(None, description="Difficulty of accessing the problem area")
    age_of_plumbing: Optional[str] = Field(None, description="Approximate age of plumbing system")

class HVACJob(BaseJob):
    """HVAC job with specialized fields"""
    category: Literal[JobCategory.HVAC] = JobCategory.HVAC
    
    # System details
    system_type: Optional[str] = Field(None, description="Type of HVAC system (AC, heater, heat pump, etc.)")
    issue_type: Optional[str] = Field(None, description="Type of issue (no cooling/heating, strange noise, etc.)")
    system_age: Optional[int] = Field(None, description="Age of HVAC system in years")
    
    # Service history
    last_service_date: Optional[str] = Field(None, description="When system was last serviced")
    brand_model: Optional[str] = Field(None, description="Brand and model of HVAC system")
    
    # Space details
    square_footage: Optional[int] = Field(None, description="Square footage of space to heat/cool")
    filter_change_frequency: Optional[str] = Field(None, description="How often filters are changed")
    thermostat_type: Optional[str] = Field(None, description="Type of thermostat (manual, programmable, smart)")

class GeneralJob(BaseJob):
    """General/Other job with flexible fields"""
    category: Literal[JobCategory.GENERAL] = JobCategory.GENERAL
    
    work_type: Optional[str] = Field(None, description="Type of general work needed")
    materials_needed: Optional[list[str]] = Field(default_factory=list, description="Materials required")
    estimated_scope: Optional[str] = Field(None, description="Estimated scope of work")
    special_requirements: Optional[str] = Field(None, description="Any special requirements or constraints")

# ============================================================================
# UNION TYPE AND COLLECTION
# ============================================================================

Job = Union[PaintingJob, ElectricalJob, PlumbingJob, HVACJob, GeneralJob]

class JobCollection(BaseModel):
    """Collection of jobs"""
    jobs: list[Job] = Field(default_factory=list)
    
    def add_job(self, job: Job):
        self.jobs.append(job)
    
    def get_job_by_id(self, job_id: str) -> Optional[Job]:
        return next((job for job in self.jobs if job.job_id == job_id), None)
    
    def get_jobs_by_category(self, category: JobCategory) -> list[Job]:
        return [job for job in self.jobs if job.category == category]