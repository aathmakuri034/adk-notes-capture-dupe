from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime
from enum import Enum

class JobCategory(str, Enum):
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

# Base Job Model
class BaseJob(BaseModel):
    session_id: Optional[str] = Field(None, description = "Unique identifier for the chat session job has been pulled from")
    job_id: Optional[str] = Field(None, description="Unique identifier for the job")
    category: JobCategory
    title: str = Field(..., description="Brief title of the job")
    description: str = Field(..., description="High-level summary of the job")
    location_type: LocationType
    specific_location: str = Field(..., description="Room/area where work is needed")
    urgency: UrgencyLevel = Field(default=UrgencyLevel.MEDIUM)
    customer_notes: Optional[str] = Field(None, description="Additional notes from customer")
    has_images: bool = Field(default=False)
    has_video: bool = Field(default=False)
    visual_analysis: Optional[str] = Field(None, description="AI analysis of provided images/videos")
    created_at: datetime = Field(default_factory=datetime.now)

# Painting Job
class PaintingJob(BaseJob):
    category: Literal[JobCategory.PAINTING] = JobCategory.PAINTING
    number_of_rooms: int = Field(..., ge=1, description="Number of rooms to paint")
    ceiling_height: float = Field(..., description="Ceiling height in feet")
    number_of_walls: Optional[int] = Field(None, description="Total number of walls")
    number_of_doors: Optional[int] = Field(None, description="Number of doors to paint")
    number_of_windows: Optional[int] = Field(None, description="Number of windows to paint around")
    room_size: Optional[str] = Field(None, description="Approximate room dimensions (e.g., '12x15 ft')")
    paint_colors: list[str] = Field(default_factory=list, description="Desired paint colors")
    surface_condition: Optional[str] = Field(None, description="Current condition of surfaces")
    prep_work_needed: Optional[str] = Field(None, description="Required prep work (patching, sanding, etc.)")

# Electrical Job
class ElectricalJob(BaseJob):
    category: Literal[JobCategory.ELECTRICAL] = JobCategory.ELECTRICAL
    installation_type: str = Field(..., description="Type of electrical work (panel, outlet, EV charger, etc.)")
    number_of_outlets: Optional[int] = Field(None, description="Number of outlets/plugs needed")
    voltage_requirement: Optional[str] = Field(None, description="Voltage requirement (e.g., 120V, 240V)")
    amperage: Optional[int] = Field(None, description="Required amperage")
    has_existing_panel: bool = Field(..., description="Whether there's an existing electrical panel")
    panel_capacity: Optional[str] = Field(None, description="Current panel capacity")
    desired_location: str = Field(..., description="Where the work should be performed")
    current_wiring: Optional[str] = Field(None, description="Description of current wiring situation")
    permits_required: Optional[bool] = Field(None, description="Whether permits are needed")

# Plumbing Job
class PlumbingJob(BaseJob):
    category: Literal[JobCategory.PLUMBING] = JobCategory.PLUMBING
    issue_type: str = Field(..., description="Type of plumbing issue (leak, clog, installation, etc.)")
    fixture_type: Optional[str] = Field(None, description="Type of fixture (sink, toilet, shower, etc.)")
    severity: str = Field(..., description="Severity of the issue (minor, moderate, severe)")
    water_damage: bool = Field(default=False, description="Whether there's visible water damage")
    water_shut_off: bool = Field(default=False, description="Whether water has been shut off")
    access_difficulty: Optional[str] = Field(None, description="Difficulty of accessing the problem area")
    age_of_plumbing: Optional[str] = Field(None, description="Approximate age of plumbing system")

# HVAC Job
class HVACJob(BaseJob):
    category: Literal[JobCategory.HVAC] = JobCategory.HVAC
    system_type: str = Field(..., description="Type of HVAC system (AC, heater, heat pump, etc.)")
    issue_type: str = Field(..., description="Type of issue (no cooling/heating, strange noise, etc.)")
    system_age: Optional[int] = Field(None, description="Age of HVAC system in years")
    last_service_date: Optional[str] = Field(None, description="When system was last serviced")
    brand_model: Optional[str] = Field(None, description="Brand and model of HVAC system")
    square_footage: Optional[int] = Field(None, description="Square footage of space to heat/cool")
    filter_change_frequency: Optional[str] = Field(None, description="How often filters are changed")
    thermostat_type: Optional[str] = Field(None, description="Type of thermostat (manual, programmable, smart)")

# General/Other Job
class GeneralJob(BaseJob):
    category: Literal[JobCategory.GENERAL] = JobCategory.GENERAL
    work_type: str = Field(..., description="Type of general work needed")
    materials_needed: Optional[list[str]] = Field(default_factory=list, description="Materials required")
    estimated_scope: Optional[str] = Field(None, description="Estimated scope of work")
    special_requirements: Optional[str] = Field(None, description="Any special requirements or constraints")

# Union type for all job types
from typing import Union

Job = Union[PaintingJob, ElectricalJob, PlumbingJob, HVACJob, GeneralJob]

# Container for saved jobs
class JobCollection(BaseModel):
    
    jobs: list[Job] = Field(default_factory=list)
    
    def add_job(self, job: Job):
        self.jobs.append(job)
    
    def get_job_by_id(self, job_id: str) -> Optional[Job]:
        return next((job for job in self.jobs if job.job_id == job_id), None)
    
    def get_jobs_by_category(self, category: JobCategory) -> list[Job]:
        return [job for job in self.jobs if job.category == category]