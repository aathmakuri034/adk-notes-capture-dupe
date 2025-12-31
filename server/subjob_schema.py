from pydantic import Field
from typing import Optional, Literal, Union
from enum import Enum

from schema import(
    UrgencyLevel,
    LocationType,
    ComplexityLevel,
    PaintingJob,
    ElectricalJob,
    PlumbingJob,
    HVACJob,
    GeneralJob
)

# ============================================================================
# SUBJOB TYPE ENUMS
# ============================================================================

class PlumbingSubJobType(str, Enum):
    BURST_PIPE = "Burst Pipe"
    DRAIN_CLEANING = "Drain Cleaning"
    WATER_HEATER = "Water Heater"
    FIXTURE_REPLACEMENT = "Fixture Replacement"
    SEWER_LINE = "Sewer Line"

class ElectricalSubJobType(str, Enum):
    OUTLET_REPAIR = "Outlet Repair"
    WIRING_PROBLEMS = "Wiring Problems"
    CODE_COMPLIANCE = "Code Compliance"
    LIGHTING_SYSTEMS = "Lighting Systems"
    CEILING_FANS = "Ceiling Fans"

class HVACSubJobType(str, Enum):
    AC_INSTALLATION_REPAIR = "AC Installation/Repair"
    REFRIGERANT_RECHARGING = "Refrigerant Recharging"
    DUCT_CLEANING = "Duct Cleaning and Sealing"
    HUMIDIFIER = "Humidifier"
    FILTER_REPLACEMENT = "Filter Replacement"

class PaintingSubJobType(str, Enum):
    WALL_CEILING_PAINTING = "Wall Ceiling Painting"
    CABINET_REFINISHING = "Cabinet Refinishing"
    WALLPAPER_SERVICES = "Wallpaper Services"
    EXTERIOR_HOUSE_PAINTING = "Exterior House Painting"
    DECK_PAINTING_STAIN = "Deck Painting/Stain"

class GeneralSubJobType(str, Enum):
    INSPECTIONS = "Inspections"
    PERMIT_PROCUREMENT = "Permit Procurement"
    HOME_ADDITIONS = "Home Additions"
    DISASTER_RECOVERY = "Disaster Recovery"

# ============================================================================
# PLUMBING SUBJOBS
# ============================================================================

class BurstPipeJob(PlumbingJob):
    """Burst Pipe Emergency"""
    
    sub_job_type: Literal[PlumbingSubJobType.BURST_PIPE] = PlumbingSubJobType.BURST_PIPE
    urgency: Literal[UrgencyLevel.EMERGENCY] = UrgencyLevel.EMERGENCY
    pipe_location: Optional[str] = Field(None, description = 'Location of burst pipe')
    pipe_type: Optional[str] = Field(None, description = 'Copper, PVC, PEX, Galvenized, etc.')
    water_type_shutoff: Optional[bool] = Field(default=False, description='Is the main water shut off')
    flooding_extent: Optional[str] = Field(None, description='Minor, moderate, or severe flooding')

class DrainCleaningJob(PlumbingJob):
    """Drain Cleaning and unclogging"""

    sub_job_type: Literal[PlumbingSubJobType.DRAIN_CLEANING] = PlumbingSubJobType.DRAIN_CLEANING
    drain_location: Optional[str] = Field(None, description='Kitchen, bathroom, shower, etc.')
    clog_severity: Optional[str] = Field(None, description='Completely blocked or slow draining')
    recurring_issue: Optional[bool] = Field(default=False, description='Does this happen frequently?')

class WaterHeaterJob(PlumbingJob):
    """Water heater installation, repair, or maintenance"""

    sub_job_type: Literal[PlumbingSubJobType.WATER_HEATER] = PlumbingSubJobType.WATER_HEATER
    heater_type: Optional[str] = Field(None, description= ' Tank or Tankless')
    heater_age: Optional[int] = Field(None, description= 'Age of water heater in years')
    heater_capacity: Optional[str] = Field(None, description= 'Capacity in gallons')
    fuel_type: Optional[str] = Field(None, description= 'Gas or Electric')
    heater_issue_description: Optional[str] = Field(None, description= ' No hot water, leaking, noises, etc.')

class FixtureReplacementJob(PlumbingJob):
    """Fixture replacement (sink, toilet, faucet, etc.)"""
    sub_job_type: Literal[PlumbingSubJobType.FIXTURE_REPLACEMENT] = PlumbingSubJobType.FIXTURE_REPLACEMENT
    fixture_to_replace: Optional[str] = Field(None, description= 'Sink, toilet, faucet, shower, etc.')
    new_fixture_provided: Optional[bool] = Field(default_factory=False, description= 'Does customer have new fixture')
    fixture_model: Optional[str] = Field(None, description= 'Brand and model if known')
    reason_for_replacement: Optional[str] = Field(None, description= 'Broken, leaking, upgrade, etc')

class SewerLineJob(PlumbingJob):
    """Sewer line repair, replacement, or cleaning"""

    sub_job_type: Literal[PlumbingSubJobType.SEWER_LINE] = PlumbingSubJobType.SEWER_LINE
    complexity: Literal[ComplexityLevel.COMPLEX] = ComplexityLevel.COMPLEX
    sewer_issue_type: Optional[str] = Field(None, description = 'Backup, blockage, damage, root intrusion, etc')
    sewage_backup_location: Optional[str] = Field(None, description= 'Where is sewage backed up?')
    camera_inspection_needed: Optional[bool] = Field(default=False, description= 'Is Camera Inspection Needed?')
    property_access: Optional[str] = Field(None, description= 'Yard, driveway, under house, etc.')


# ============================================================================
# ELECTRICAL SUBJOBS
# ============================================================================

class OutletRepairJob(ElectricalJob):
    """Outlet repair or replacement"""
    sub_job_type: Literal[ElectricalSubJobType.OUTLET_REPAIR] = ElectricalSubJobType.OUTLET_REPAIR
    
    outlet_issue: Optional[str] = Field(None, description="Not working, sparking, loose, burned, etc")
    outlet_location: Optional[str] = Field(None, description="Kitchen, bedroom, garage, etc")
    outlet_type_needed: Optional[str] = Field(None, description="Standard, GFCI, USB, etc")
    outlets_affected: Optional[int] = Field(None, ge=1, description="Number of outlets to repair")

class WiringProblemsJob(ElectricalJob):
    """Wiring issues and repairs"""
    sub_job_type: Literal[ElectricalSubJobType.WIRING_PROBLEMS] = ElectricalSubJobType.WIRING_PROBLEMS
    
    wiring_issue: Optional[str] = Field(None, description="Flickering lights, dead outlets, buzzing, etc")
    affected_circuits: Optional[list[str]] = Field(default_factory=list, description="Which rooms/circuits affected")
    visible_damage: bool = Field(default=False, description="Can you see damaged wiring")
    safety_concern: bool = Field(default=False, description="Burning smell, sparks, etc")

class CodeComplianceJob(ElectricalJob):
    """Electrical code compliance and upgrades"""
    sub_job_type: Literal[ElectricalSubJobType.CODE_COMPLIANCE] = ElectricalSubJobType.CODE_COMPLIANCE
    
    compliance_reason: Optional[str] = Field(None, description="Home sale, inspection, insurance, renovation, etc")
    violations_identified: Optional[list[str]] = Field(default_factory=list, description="Known code violations")
    inspection_report_available: Optional[bool] = Field(default=False, description="Have inspection report")

class LightingSystemsJob(ElectricalJob):
    """Lighting installation or repair"""
    sub_job_type: Literal[ElectricalSubJobType.LIGHTING_SYSTEMS] = ElectricalSubJobType.LIGHTING_SYSTEMS
    
    lighting_type: Optional[str] = Field(None, description="Recessed, pendant, chandelier, landscape, etc")
    number_of_fixtures: Optional[int] = Field(None, ge=1, description="Number of light fixtures")
    rooms_for_lighting: Optional[list[str]] = Field(None, description="Which rooms")
    dimmer_switches: Optional[bool] = Field(default=False, description="Install dimmer switches")

class CeilingFanJob(ElectricalJob):
    """Ceiling fan installation or repair"""
    sub_job_type: Literal[ElectricalSubJobType.CEILING_FANS] = ElectricalSubJobType.CEILING_FANS
    
    number_of_fans: Optional[int] = Field(None, ge=1, description="Number of ceiling fans")
    fan_locations: Optional[list[str]] = Field(None, description="Bedroom, living room, etc")
    existing_wiring: Optional[bool] = Field(None, description="Is ceiling wiring already present")
    fan_provided: Optional[bool] = Field(None, description="Does customer have the fan")

# ============================================================================
# HVAC SUBJOBS
# ============================================================================

class ACInstallationRepairJob(HVACJob):
    """AC installation or repair"""
    sub_job_type: Literal[HVACSubJobType.AC_INSTALLATION_REPAIR] = HVACSubJobType.AC_INSTALLATION_REPAIR
    
    service_type: Optional[str] = Field(None, description="Installation, repair, or replacement")
    ac_issue: Optional[str] = Field(None, description="Not cooling, not turning on, noisy, etc")
    system_tonnage: Optional[str] = Field(None, description="Tonnage if known")
    outdoor_unit_running: Optional[bool] = Field(None, description="Is outdoor unit running")

class RefrigerantRechargingJob(HVACJob):
    """Refrigerant recharging"""
    sub_job_type: Literal[HVACSubJobType.REFRIGERANT_RECHARGING] = HVACSubJobType.REFRIGERANT_RECHARGING
    
    refrigerant_type: Optional[str] = Field(None, description="R-22, R-410A, etc")
    suspected_leak: Optional[bool] = Field(default=False, description="Suspected leak")
    cooling_performance: Optional[str] = Field(None, description="Not cooling, weak cooling, etc")

class DuctCleaningJob(HVACJob):
    """Duct cleaning and sealing"""
    sub_job_type: Literal[HVACSubJobType.DUCT_CLEANING] = HVACSubJobType.DUCT_CLEANING
    
    last_cleaning: Optional[str] = Field(None, description="When ducts last cleaned")
    visible_mold: Optional[bool] = Field(default=False, description="Mold visible in ducts")
    airflow_issues: Optional[bool] = Field(default=False, description="Uneven airflow between rooms")
    sealing_needed: Optional[bool] = Field(default=False, description="Duct sealing needed")

class HumidifierJob(HVACJob):
    """Humidifier installation or service"""
    sub_job_type: Literal[HVACSubJobType.HUMIDIFIER] = HVACSubJobType.HUMIDIFIER
    
    humidifier_type: Optional[str] = Field(None, description="Whole house, portable, steam, bypass, etc")
    install_or_repair: Optional[str] = Field(None, description="New installation or repair existing")
    humidity_issues: Optional[str] = Field(None, description="Dry skin, static, wood cracking, etc")

class FilterReplacementJob(HVACJob):
    """Filter replacement service"""
    sub_job_type: Literal[HVACSubJobType.FILTER_REPLACEMENT] = HVACSubJobType.FILTER_REPLACEMENT
    complexity: Literal[ComplexityLevel.BASIC] = ComplexityLevel.BASIC
    
    filter_type_needed: Optional[str] = Field(None, description="Standard, HEPA, electrostatic, etc")
    filter_size: Optional[str] = Field(None, description="Filter dimensions")
    subscription_service: Optional[bool] = Field(default=False, description="Interested in regular service")

# ============================================================================
# PAINTING SUBJOBS
# ============================================================================

class WallCeilingPaintingJob(PaintingJob):
    """Wall and ceiling painting"""
    sub_job_type: Literal[PaintingSubJobType.WALL_CEILING_PAINTING] = PaintingSubJobType.WALL_CEILING_PAINTING
    
    rooms_to_paint: Optional[list[str]] = Field(None, description="Living room, bedroom, kitchen, etc")
    paint_ceilings: Optional[bool] = Field(default=False, description="Paint ceilings too")
    paint_trim: Optional[bool] = Field(default=False, description="Paint trim/baseboards")

class CabinetRefinishingJob(PaintingJob):
    """Cabinet refinishing or painting"""
    sub_job_type: Literal[PaintingSubJobType.CABINET_REFINISHING] = PaintingSubJobType.CABINET_REFINISHING
    
    cabinet_location: Optional[str] = Field(None, description="Kitchen, bathroom, laundry, etc")
    number_of_cabinets: Optional[int] = Field(None, ge=1, description="Number of cabinet units")
    finish_type: Optional[str] = Field(None, description="Paint, stain, or refinish")
    hardware_replacement: Optional[bool] = Field(default=False, description="Replace knobs/handles")

class WallpaperServicesJob(PaintingJob):
    """Wallpaper installation or removal"""
    sub_job_type: Literal[PaintingSubJobType.WALLPAPER_SERVICES] = PaintingSubJobType.WALLPAPER_SERVICES
    
    service_type: Optional[str] = Field(None, description="Installation, removal, or both")
    rooms_for_wallpaper: Optional[list[str]] = Field(None, description="Which rooms")
    wallpaper_provided: Optional[bool] = Field(None, description="Customer has wallpaper")
    walls_to_cover: Optional[int] = Field(None, ge=1, description="Number of walls")

class ExteriorHousePaintingJob(PaintingJob):
    """Exterior house painting"""
    sub_job_type: Literal[PaintingSubJobType.EXTERIOR_HOUSE_PAINTING] = PaintingSubJobType.EXTERIOR_HOUSE_PAINTING
    location_type: Literal[LocationType.OUTDOOR] = LocationType.OUTDOOR
    
    house_stories: Optional[int] = Field(None, ge=1, description="Number of stories")
    siding_type: Optional[str] = Field(None, description="Wood, vinyl, brick, stucco, etc")
    approximate_square_feet: Optional[int] = Field(None, description="Exterior square footage")
    trim_included: Optional[bool] = Field(None, description="Paint trim and shutters")

class DeckPaintingJob(PaintingJob):
    """Deck painting or staining"""
    sub_job_type: Literal[PaintingSubJobType.DECK_PAINTING_STAIN] = PaintingSubJobType.DECK_PAINTING_STAIN
    location_type: Literal[LocationType.OUTDOOR] = LocationType.OUTDOOR
    
    deck_size: Optional[str] = Field(None, description="Approximate dimensions (e.g., 12x20 ft)")
    finish_type: Optional[str] = Field(None, description="Paint, stain, or seal")
    deck_material: Optional[str] = Field(None, description="Wood type or composite")
    railings_included: Optional[bool] = Field(None, description="Stain/paint railings")

# ============================================================================
# GENERAL SUBJOBS
# ============================================================================

class InspectionsJob(GeneralJob):
    """Home inspections"""
    sub_job_type: Literal[GeneralSubJobType.INSPECTIONS] = GeneralSubJobType.INSPECTIONS
    
    inspection_type: Optional[str] = Field(None, description="Pre-purchase, maintenance, insurance, etc")
    property_age: Optional[int] = Field(None, description="Age of property in years")
    specific_concerns: Optional[list[str]] = Field(default_factory=list, description="Foundation, roof, electrical, etc")

class PermitProcurementJob(GeneralJob):
    """Permit procurement services"""
    sub_job_type: Literal[GeneralSubJobType.PERMIT_PROCUREMENT] = GeneralSubJobType.PERMIT_PROCUREMENT
    
    permit_type: Optional[str] = Field(None, description="Building, electrical, plumbing, etc")
    project_description: Optional[str] = Field(None, description="What project needs permit")
    jurisdiction: Optional[str] = Field(None, description="City and county")

class HomeAdditionsJob(GeneralJob):
    """Home additions and expansions"""
    sub_job_type: Literal[GeneralSubJobType.HOME_ADDITIONS] = GeneralSubJobType.HOME_ADDITIONS
    complexity: Literal[ComplexityLevel.COMPLEX] = ComplexityLevel.COMPLEX
    
    addition_type: Optional[str] = Field(None, description="Room, second story, sunroom, garage, etc")
    approximate_square_feet: Optional[int] = Field(None, description="Size of addition")
    foundation_needed: Optional[bool] = Field(None, description="New foundation required")

class DisasterRecoveryJob(GeneralJob):
    """Disaster recovery and restoration"""
    sub_job_type: Literal[GeneralSubJobType.DISASTER_RECOVERY] = GeneralSubJobType.DISASTER_RECOVERY
    urgency: Literal[UrgencyLevel.HIGH, UrgencyLevel.EMERGENCY] = UrgencyLevel.HIGH
    
    disaster_type: Optional[str] = Field(None, description="Fire, flood, storm, wind damage, etc")
    extent_of_damage: Optional[str] = Field(None, description="Minor, moderate, or severe")
    insurance_claim: Optional[bool] = Field(None, description="Filing insurance claim")
    immediate_needs: Optional[list[str]] = Field(None, description="Board up, tarp, water removal, etc")

# ============================================================================
# UNION TYPES FOR DETAILED SUBJOBS
# ============================================================================

DetailedPlumbingJob = Union[
    BurstPipeJob,
    DrainCleaningJob,
    WaterHeaterJob,
    FixtureReplacementJob,
    SewerLineJob
]

DetailedElectricalJob = Union[
    OutletRepairJob,
    WiringProblemsJob,
    CodeComplianceJob,
    LightingSystemsJob,
    CeilingFanJob
]

DetailedHVACJob = Union[
    ACInstallationRepairJob,
    RefrigerantRechargingJob,
    DuctCleaningJob,
    HumidifierJob,
    FilterReplacementJob
]

DetailedPaintingJob = Union[
    WallCeilingPaintingJob,
    CabinetRefinishingJob,
    WallpaperServicesJob,
    ExteriorHousePaintingJob,
    DeckPaintingJob
]

DetailedGeneralJob = Union[
    InspectionsJob,
    PermitProcurementJob,
    HomeAdditionsJob,
    DisasterRecoveryJob
]

# All detailed subjobs
DetailedJob = Union[
    DetailedPlumbingJob,
    DetailedElectricalJob,
    DetailedHVACJob,
    DetailedPaintingJob,
    DetailedGeneralJob
]