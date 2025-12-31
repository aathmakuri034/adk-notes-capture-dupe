"""
Job Extraction Pipeline using Vertex AI with Your JSON Schema
Extracts structured job data using your existing schema and prompt
"""

import json
import os
import asyncio
from datetime import datetime as dt
from typing import Dict, List, Optional, Union
from pathlib import Path
from enum import Enum

# Pydantic v2 imports
from pydantic import ValidationError
from google.genai import Client
import google.genai.types as types
import logging
from schema import (
    Job,
    PaintingJob,
    ElectricalJob,
    PlumbingJob,
    HVACJob,
    GeneralJob
)

from subjob_schema import (
    # Plumbing Subjobs
    BurstPipeJob,
    DrainCleaningJob,
    WaterHeaterJob,
    FixtureReplacementJob,
    SewerLineJob,
    PlumbingSubJobType,
    
    # Electrical subjob
    OutletRepairJob,
    WiringProblemsJob,
    CodeComplianceJob,
    LightingSystemsJob,
    CeilingFanJob,
    ElectricalSubJobType,

    # HVAC subjob
    ACInstallationRepairJob,
    RefrigerantRechargingJob,
    DuctCleaningJob,
    HumidifierJob,
    FilterReplacementJob,
    HVACSubJobType,

    # Painting subjobs
    WallCeilingPaintingJob,
    CabinetRefinishingJob,
    WallpaperServicesJob,
    ExteriorHousePaintingJob,
    DeckPaintingJob,
    PaintingSubJobType,

    # General subjobs
    InspectionsJob,
    PermitProcurementJob,
    HomeAdditionsJob,
    DisasterRecoveryJob,
    GeneralSubJobType,

    DetailedJob
)

# Set up logging
logger = logging.getLogger(__name__)

# Configuration
OUTPUT_DIR = "conversation_data"
MODEL = os.getenv("MODEL", "gemini-2.5-flash")
PROJECT_ID = os.getenv("PROJECT_ID")
LOCATION = os.getenv("LOCATION")

Path(OUTPUT_DIR).mkdir(exist_ok=True)

# ============================================================================
# SUBJOB TYPE MAPPING
# ============================================================================

SUBJOB_MODELS = {
    # Plumbing
    PlumbingSubJobType.BURST_PIPE: BurstPipeJob,
    PlumbingSubJobType.DRAIN_CLEANING: DrainCleaningJob,
    PlumbingSubJobType.WATER_HEATER: WaterHeaterJob,
    PlumbingSubJobType.FIXTURE_REPLACEMENT: FixtureReplacementJob,
    PlumbingSubJobType.SEWER_LINE: SewerLineJob,
    
    # Electrical
    ElectricalSubJobType.OUTLET_REPAIR: OutletRepairJob,
    ElectricalSubJobType.WIRING_PROBLEMS: WiringProblemsJob,
    ElectricalSubJobType.CODE_COMPLIANCE: CodeComplianceJob,
    ElectricalSubJobType.LIGHTING_SYSTEMS: LightingSystemsJob,
    ElectricalSubJobType.CEILING_FANS: CeilingFanJob,
    
    # HVAC
    HVACSubJobType.AC_INSTALLATION_REPAIR: ACInstallationRepairJob,
    HVACSubJobType.REFRIGERANT_RECHARGING: RefrigerantRechargingJob,
    HVACSubJobType.DUCT_CLEANING: DuctCleaningJob,
    HVACSubJobType.HUMIDIFIER: HumidifierJob,
    HVACSubJobType.FILTER_REPLACEMENT: FilterReplacementJob,
    
    # Painting
    PaintingSubJobType.WALL_CEILING_PAINTING: WallCeilingPaintingJob,
    PaintingSubJobType.CABINET_REFINISHING: CabinetRefinishingJob,
    PaintingSubJobType.WALLPAPER_SERVICES: WallpaperServicesJob,
    PaintingSubJobType.EXTERIOR_HOUSE_PAINTING: ExteriorHousePaintingJob,
    PaintingSubJobType.DECK_PAINTING_STAIN: DeckPaintingJob,
    
    # General
    GeneralSubJobType.INSPECTIONS: InspectionsJob,
    GeneralSubJobType.PERMIT_PROCUREMENT: PermitProcurementJob,
    GeneralSubJobType.HOME_ADDITIONS: HomeAdditionsJob,
    GeneralSubJobType.DISASTER_RECOVERY: DisasterRecoveryJob,
}

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
    

    def _get_subjob_examples(self, category: str) -> str:
        """Ger relevant subjob examples based on category"""

        examples = {
            "plumbing": """
                Available sub_job_types: "Burst Pipe", "Drain Cleaning", "Water Heater", "Fixture Replacement", "Sewer Line"

                BURST PIPE (Emergency):
                {
                    "category": "plumbing",
                    "sub_job_type": "Burst Pipe",
                    "urgency": "emergency",
                    "pipe_location": "Basement/kitchen/etc",
                    "pipe_type": "Copper/PVC/PEX/Galvanized",
                    "water_type_shutoff": true/false,
                    "flooding_extent": "Minor/moderate/severe"
                }

                DRAIN CLEANING:
                {
                    "category": "plumbing",
                    "sub_job_type": "Drain Cleaning",
                    "drain_location": "Kitchen/bathroom/shower",
                    "clog_severity": "Completely blocked/slow draining",
                    "recurring_issue": true/false
                }

                WATER HEATER:
                {
                    "category": "plumbing",
                    "sub_job_type": "Water Heater",
                    "heater_type": "Tank/Tankless",
                    "heater_age": 5,
                    "fuel_type": "Gas/Electric",
                    "heater_issue_description": "No hot water/leaking/noises"
                }

                FIXTURE REPLACEMENT:
                {
                    "category": "plumbing",
                    "sub_job_type": "Fixture Replacement",
                    "fixture_to_replace": "Sink/Toilet/Faucet/Shower/etc.",
                    "new_fixture_provided": true/false,
                    "fixture_model": "Brand and model if known",
                    "reason_for_replacement": "Broek/leaking/upgrade/etc"
                }

                SEWER LINE:
                {
                    "category": "plumbing",
                    "sub_job_type": "Sewer Line",
                    "complexity": "complex",
                    "sewer_issue_type": "Backup/blockage/damage/root intrusion",
                    "sewage_backup_location": "Where sewage is backed up?",
                    "camera_inspection_needed": true/false,
                    "property_access"; "Yard/driveway/Under House/ etc"
                }
            """,
            
            "electrical": """
                Available sub_job_types: "Outlet Repair", "Wiring Problems", "Code Compliance", "Lighting Systems", "Ceiling Fans"

                OUTLET REPAIR:
                {
                    "category": "electrical",
                    "sub_job_type": "Outlet Repair",
                    "outlet_issue": "Not working/sparking/loose/burned",
                    "outlet_location": "Kitchen/bedroom/garage",
                    "outlet_type_needed": "Standard/GFCI/USB",
                    "outlets_affected": 1
                }

                CEILING FANS:
                {
                    "category": "electrical",
                    "sub_job_type": "Ceiling Fans",
                    "number_of_fans": 2,
                    "fan_locations": ["Bedroom", "Living room"],
                    "existing_wiring": true/false,
                    "fan_provided": true/false
                }

                WIRING PROBLEMS:
                {
                    "category": "electrical",
                    "sub_job_type": "Wiring Problems",
                    "wiring_issue": "Flickering Lights/ dead outlets/buzzing/etc.",
                    "affected_circuits": ["Room1", "Room2"],
                    "visible_damage": true/false,
                    "safety_concern": true/false
                }

                CODE COMPLIANCE:
                {
                    "category": "electrical",
                    "sub_job_type": "Code Compliance",
                    "compliance_reason": "Home sale/inspection/insurance/renovation/etc",
                    "violations_identified": ["Violation 1", "Violation 2"],
                    "inspection_report_available": true/false
                }

                LIGHTING SYSTEMS:
                {
                    "category": "electrical",
                    "sub_job_type": "Lighting Systems",
                    "lighting_type": "Recessed/pendant/chandelier/landscape/etc",
                    "number_of_fixtures": 3,
                    "rooms_for_lighting": ["Living room", "Kitchen"],
                    "dimmer_switches": true/false
                }
            """,
            
            "hvac": """
                Available sub_job_types: "AC Installation/Repair", "Refrigerant Recharging", "Duct Cleaning and Sealing", "Humidifier", "Filter Replacement"

                AC INSTALLATION/REPAIR:
                {
                    "category": "hvac",
                    "sub_job_type": "AC Installation/Repair",
                    "service_type": "Installation/repair/replacement",
                    "ac_issue": "Not cooling/not turning on/noisy",
                    "system_tonnage": "2.5 ton",
                    "outdoor_unit_running": true/false
                }

                FILTER REPLACEMENT:
                {
                    "category": "hvac",
                    "sub_job_type": "Filter Replacement",
                    "complexity": "basic",
                    "filter_type_needed": "Standard/HEPA/electrostatic",
                    "filter_size": "16x25x1"
                }

                REFRIDGERANT RECHARGING:
                {
                    "category": "hvac",
                    "sub_job_type": "Refrigerant Recharging",
                    "refrigerant_type": "R-22/R-410A/etc",
                    "suspected_leak": true/false,
                    "cooling_performance": "Not cooling/weak cooling/etc"
                }

                DUCT CLEANING AND SEALING:
                {
                    "category": "hvac",
                    "sub_job_type": "Duct Cleaning and Sealing",
                    "last_cleaning": "2 years ago/never/unknown",
                    "visible_mold": true/false,
                    "airflow_issues": true/false,
                    "sealing_needed": true/false
                }

                HUMIDIFIER:
                {
                    "category": "hvac",
                    "sub_job_type": "Humidifier",
                    "humidifier_type": "Whole house/portable/steam/bypass/etc",
                    "install_or_repair": "New installation/repair existing",
                    "humidity_issues": "Dry skin/static/wood cracking/etc"
                }
            """,
            
            "painting": """
                Available sub_job_types: "Wall Ceiling Painting", "Cabinet Refinishing", "Wallpaper Services", "Exterior House Painting", "Deck Painting/Stain"

                WALL CEILING PAINTING:
                {
                    "category": "painting",
                    "sub_job_type": "Wall Ceiling Painting",
                    "rooms_to_paint": ["Living room", "Bedroom"],
                    "paint_ceilings": true/false,
                    "paint_trim": true/false,
                    "number_of_rooms": 1,
                    "ceiling_height": 8.0,
                    "paint_colors": ["white", "blue"]
                }

                CABINET REFINISHING:
                {
                    "category": "painting",
                    "sub_job_type": "Cabinet Refinishing",
                    "cabinet_location": "Kitchen/bathroom/laundry/etc",
                    "number_of_cabinets": 12,
                    "finish_type": "Paint/stain/refinish",
                    "hardware_replacement": true/false
                }

                WALLPAPER SERVICES:
                {
                    "category": "painting",
                    "sub_job_type": "Wallpaper Services",
                    "service_type": "Installation/removal/both",
                    "rooms_for_wallpaper": ["Dining room"],
                    "wallpaper_provided": true/false,
                    "walls_to_cover": 4
                }

                EXTERIOR HOUSE PAINTING:
                {
                    "category": "painting",
                    "sub_job_type": "Exterior House Painting",
                    "location_type": "outdoor",
                    "house_stories": 2,
                    "siding_type": "Wood/vinyl/brick/stucco/etc",
                    "approximate_square_feet": 2000,
                    "trim_included": true/false
                }

                DECK PAINTING/STAIN:
                {
                    "category": "painting",
                    "sub_job_type": "Deck Painting/Stain",
                    "location_type": "outdoor",
                    "deck_size": "12x20 ft",
                    "finish_type": "Paint/stain/seal",
                    "deck_material": "Cedar/composite/pressure-treated/etc",
                    "railings_included": true/false
                }
            """,
            
            "general": """
                Available sub_job_types: "Inspections", "Permit Procurement", "Home Additions", "Disaster Recovery"

                INSPECTIONS:
                {
                    "category": "general",
                    "sub_job_type": "Inspections",
                    "inspection_type": "Pre-purchase/maintenance/insurance",
                    "property_age": 20,
                    "specific_concerns": ["Foundation", "Roof"]
                }

                PERMIT PROCUREMENT:
                {
                    "category": "general",
                    "sub_job_type": "Permit Procurement",
                    "permit_type": "Building/electrical/plumbing/etc",
                    "project_description": "Description of project needing permit",
                    "jurisdiction": "City and county"
                }

                HOME ADDITIONS (Complex):
                {
                    "category": "general",
                    "sub_job_type": "Home Additions",
                    "complexity": "complex",
                    "addition_type": "Room/second story/sunroom/garage/etc",
                    "approximate_square_feet": 300,
                    "foundation_needed": true/false
                }

                DISASTER RECOVERY:
                {
                    "category": "general",
                    "sub_job_type": "Disaster Recovery",
                    "urgency": "high" or "emergency",
                    "disaster_type": "Fire/flood/storm",
                    "extent_of_damage": "Minor/moderate/severe",
                    "insurance_claim": true/false
                }
            """
        }
                    
        return examples.get(category, "")


    async def _identify_category(self, text:str) -> str:
        """First pass: identify job category"""
        prompt = f"""Analyze this job description and identify ONLY the category.

        JOB DESCRIPTION:
        {text}

        Return ONLY a JSON object with this format:
        {{
        "category": "plumbing" OR "electrical" OR "hvac" OR "painting" OR "general"
        }}

        Choose the most appropriate category. Return ONLY the JSON, nothing else."""

        try:
            response = await asyncio.to_thread(
                self.client.models.generate_content,
                model=self.model,
                contents=[
                    types.Content(
                        role="user",
                        parts=[types.Part(text=prompt)]
                    )
                ]
            )
            
            raw = response.text.strip()
            data = self._safe_json_parse(raw)
            category = data.get("category", "general").lower()
            logger.info(f"Identified category: {category}")
            return category
            
        except Exception as e:
            logger.error(f"Error identifying category: {e}")
            return "general"


    def _build_extraction_prompt(self, text: str, category: str) -> str:
        """Build prompt using your exact format"""
        subjob_examples = self._get_subjob_examples(category)
        category_base_fields = self._get_category_base_fields(category)
    
        prompt = f"""Analyze the following job description and extract ALL available information.

            JOB DESCRIPTION:
            {text}

            REQUIRED BASE FIELDS (always include these):
            {{
                "category": "{category}",
                "title": "Brief descriptive title (3-8 words)",
                "description": "One sentence summary of the work needed",
                "location_type": "indoor" OR "outdoor" OR "both",
                "specific_location": "Room/area name",
                "urgency": "low" OR "medium" OR "high" OR "emergency",
                "complexity": "basic" OR "intermediate" OR "complex",
                "estimated_duration_minutes": <number>,
                "problem_type": "Brief problem category",
                "customer_notes": "Additional context (or null)",
                "tools_needed": "Tools required (or null)",
                "key_details": ["Important detail 1", "Important detail 2"],
                "has_images": false,
                "has_video": false
            }}

            {category_base_fields}

            SUBJOB TYPES AND SPECIFIC FIELDS:
            {subjob_examples}

            IMPORTANT RULES:
            1. ALWAYS include ALL required base fields above
            2. Include "sub_job_type" when you can identify the specific type
            3. Fill in category-specific fields
            4. Fill in subjob-specific fields when applicable
            5. Use null for missing optional values
            6. Estimate duration: basic=60-90min, intermediate=120-180min, complex=240+min
            7. Create key_details array with 3-5 important points
            8. Return ONLY valid JSON, no markdown code blocks
            """
        return prompt
    

    def _get_category_base_fields(self, category: str) -> str:
        """Get category-specific base fields that should always be included"""
    
        category_fields = {
            "plumbing": """
                PLUMBING-SPECIFIC BASE FIELDS (include when available):
                - "issue_type": "leak/clog/installation/repair/etc"
                - "fixture_type": "sink/toilet/shower/bathtub/etc"
                - "severity": "minor/moderate/severe"
                - "water_damage": true/false
                - "water_shut_off": true/false
                - "access_difficulty": "easy/moderate/difficult"
                - "age_of_plumbing": "approximate age or unknown"
        """,
            "electrical": """
                ELECTRICAL-SPECIFIC BASE FIELDS (include when available):
                - "installation_type": "outlet/panel/lighting/wiring/etc"
                - "number_of_outlets": <number>
                - "voltage_requirement": "120V/240V/etc"
                - "amperage": <number>
                - "has_existing_panel": true/false
                - "panel_capacity": "100A/200A/etc"
                - "desired_location": "Specific location description"
                - "current_wiring": "Description of existing wiring"
                - "permits_required": true/false
        """,
            "hvac": """
                HVAC-SPECIFIC BASE FIELDS (include when available):
                - "system_type": "AC/heater/heat pump/etc"
                - "issue_type": "no cooling/no heating/noise/etc"
                - "system_age": <number in years>
                - "last_service_date": "date or 'unknown'"
                - "brand_model": "Brand and model if known"
                - "square_footage": <number>
                - "filter_change_frequency": "monthly/quarterly/etc"
                - "thermostat_type": "manual/programmable/smart"
        """,
            "painting": """
                PAINTING-SPECIFIC BASE FIELDS (include when available):
                - "number_of_rooms": <number>
                - "ceiling_height": <number in feet>
                - "room_size": "Dimensions (e.g., 12x15 ft)"
                - "number_of_walls": <number>
                - "number_of_doors": <number>
                - "number_of_windows": <number>
                - "paint_colors": ["color1", "color2"]
                - "surface_condition": "good/fair/needs repair"
                - "prep_work_needed": "patching/sanding/priming/etc"
        """,
            "general": """
                GENERAL-SPECIFIC BASE FIELDS (include when available):
                - "work_type": "Type of general work needed"
                - "materials_needed": ["material1", "material2"]
                - "estimated_scope": "Brief scope description"
                - "special_requirements": "Any special requirements"
        """
        }
            
        return category_fields.get(category, "")

    
    async def extract_from_text(self, job_text: str) -> Optional[Union[Job, DetailedJob]]:
        """
        Extract structured job data from job description text.
        
        Args:
            job_text: Natural language description of the job
            
        Returns:
            Validated JobList object
        """
        
        category = await self._identify_category(job_text)

        user_prompt = self._build_extraction_prompt(job_text, category)
        
        system_message = """
            You are a JSON extraction engine for home repair job intake.
            You never greet users.
            You never act conversationally.
            You ONLY output structured JSON object that match the required schema.
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
            job_data = self._safe_json_parse(raw)
            
            if not job_data:
                logger.warning("No valid JSON extracted")
                return None
            
            # Validate with appropriate Pydantic model
            job = self._validate_job(job_data)
            
            if job:
                logger.info(f"Successfully extracted {job.category} job: {job.title}")
            
            return job
            
        except Exception as e:
            logger.error(f"Error extracting job data: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    def _safe_json_parse(self, raw: str) -> Optional[dict]:
        """Safely parse JSON from LLM response"""
        try:
            parsed = json.loads(raw)
            return parsed
        except json.JSONDecodeError:
            # Try to extract JSON from markdown code blocks
            try:
                if "```json" in raw:
                    raw = raw.split("```json")[1].split("```")[0].strip()
                elif "```" in raw:
                    raw = raw.split("```")[1].split("```")[0].strip()
                
                # Try to find JSON object boundaries
                start = raw.index("{")
                end = raw.rindex("}") + 1
                cleaned = raw[start:end]
                parsed = json.loads(cleaned)
                
                return parsed
            except Exception as e:
                logger.error(f"Failed to parse JSON: {e}")
                logger.error(f"Raw response:\n{raw}")
                return None
    

    def _validate_job(self, job_data: dict) -> Optional[Job]:
        """
        Validate job data against appropriate Pydantic Model.
        Tries subjob models first, falls back to base models if there are no subjobs relevant.
        """
        category = job_data.get("category", "").lower()
        sub_job_type = job_data.get("sub_job_type")

        # Category to enum mapping
        CATEGORY_ENUM_MAP = {
            "plumbing": PlumbingSubJobType,
            "electrical": ElectricalSubJobType,
            "hvac": HVACSubJobType,
            "painting": PaintingSubJobType,
            "general": GeneralSubJobType
        }

        # Category to base model mapping
        CATEGORY_BASE_MODEL_MAP  = {
            "plumbing": PlumbingJob,
            "electrical": ElectricalJob,
            "hvac": HVACJob,
            "painting": PaintingJob,
            "general": GeneralJob
        }
        
        # Try to match with detailed subjob model first
        if sub_job_type:
            logger.info(f"Attempting to validate subjob type: '{sub_job_type}'")
            try:
                enum_class = CATEGORY_ENUM_MAP.get(category)

                if enum_class:
                    subjob_enum = enum_class(sub_job_type)

                    if subjob_enum in SUBJOB_MODELS:
                        model_class = SUBJOB_MODELS[subjob_enum]
                        logger.info(f"Validating as {model_class.__name__}")
                        return model_class(**job_data)
            
            except ValueError as e:
                logger.warning(f"Invalid subjob type '{sub_job_type}': {e}")
                logger.info("Falling back to base job model")
            except ValidationError as e:
                logger.warning(f"Failed to validate as subjob: {e}")
                logger.info("Falling back to base job model")
        
        # Fall back to base job models (or if no subjob type)
        try:
            logger.info(f"Validating as base {category} job")
            model_class = CATEGORY_BASE_MODEL_MAP.get(category)

            if model_class:
                return model_class(**job_data)
            else:
                logger.warning(f"Unknown category: {category}, defaulting to GeneralJob")
                job_data["category"] = "general"
                return GeneralJob(*job_data)
                
        except ValidationError as e:
            logger.error(f"Validation error for {category} job: {e}")
            logger.error(f"Job data: {json.dumps(job_data, indent=2)}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error validating job: {e}")
            import traceback
            traceback.print_exc()
            return None
    
    
    async def save_to_individual_file(
            self,
            job: Union[Job, DetailedJob], 
            session_id: str,
            user_id: str = 'anon'
    ) -> Optional[str]:
        """
        Save each extracted job to its own JSON file.
        Thread-safe with deduplication and Pydantic validiation

        Returns:
            List of file paths that were created/updated
        """

        if not job:
            logger.info("No job to save")
            return None

        async with self.lock:
            # Check if similar job already exists
            if self._job_file_exists(job.title):
                logger.info(f"Skipping duplicate job: '{job.title}'")
                return None

            # Generate unique job ID and filename
            job_id = self._generate_job_id()
            filename = self._sanitize_filename(job.title, job_id)
            filepath = os.path.join(OUTPUT_DIR, filename)

            # Set IDs and timestamps
            job.job_id = job_id
            job.session_id = session_id
            job.user_id = user_id
            job.last_updated = dt.now()

            # Convert to dict for storage
            job_data = job.model_dump(exclude_none=True)

            # Save to file
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(job_data, f, indent=2, ensure_ascii=False, default=str)
            
            subjob_type = job_data.get('sub_job_type', 'N/A')
            logger.info(f"Saved job to: {filepath} (sub_job_type : {subjob_type})")
            return filepath


    def _sanitize_filename(self, title: str, job_id: str) -> str:
        """
        Create a safe filename from job title and ID.
        Format: job_<id>_<sanitized_title>.json
        """
        # Remove/replace unsafe characters
        safe_title = "".join(c if c.isalnum() or c in (' ', '-', '_') else '_' for c in title)
        # Replace spaces with underscores and limit length
        safe_title = safe_title.replace(' ', '_')[:50]
        # Create filename with ID prefix for uniqueness
        return f"job_{job_id}_{safe_title}.json"
    

    def _job_file_exists(self, title: str) -> bool:
        """
        Check if a job with similar title already exists.
        Checks all files in conversation_data directory.
        """
        title_lower = title.lower().strip()
        
        if not os.path.exists(OUTPUT_DIR):
            return False
        
        for filename in os.listdir(OUTPUT_DIR):
            if not filename.startswith('job_') or not filename.endswith('.json'):
                continue
            
            filepath = os.path.join(OUTPUT_DIR, filename)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    existing_job = json.load(f)
                    existing_title = existing_job.get('title', '').lower().strip()
                    
                    # Check for exact match
                    if title_lower == existing_title:
                        return True
                    
                    # Check for fuzzy match (one title contains the other)
                    if len(title_lower) > 5 and (
                        title_lower in existing_title or existing_title in title_lower
                    ):
                        return True
            except Exception as e:
                logger.warning(f"Error reading file {filename}: {e}")
                continue
        
        return False


    def _generate_job_id(self) -> str:
        """Generate unique job ID"""
        import hashlib
        timestamp = dt.now().isoformat()
        return hashlib.sha256(timestamp.encode()).hexdigest()[:12]
    

    def get_all_jobs(self) -> List[dict]:
        """
        Read all job files and return as a list.
        Useful for displaying all jobs in the UI.
        """
        jobs = []
        
        if not os.path.exists(OUTPUT_DIR):
            return jobs
        
        for filename in os.listdir(OUTPUT_DIR):
            if not filename.startswith('job_') or not filename.endswith('.json'):
                continue
            
            filepath = os.path.join(OUTPUT_DIR, filename)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    job_data = json.load(f)
                    jobs.append(job_data)
            except Exception as e:
                logger.error(f"Error reading job file {filename}: {e}")
        
        # Sort by created_at timestamp (newest first)
        jobs.sort(key=lambda x: x.get('created_at', ''), reverse=True)
        return jobs

    def get_job_by_id(self, job_id: str) -> Optional[dict]:
        """
        Retrieve a specific job by its ID.
        """
        if not os.path.exists(OUTPUT_DIR):
            return None
        
        for filename in os.listdir(OUTPUT_DIR):
            if not filename.startswith('job_') or not filename.endswith('.json'):
                continue
            
            filepath = os.path.join(OUTPUT_DIR, filename)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    job_data = json.load(f)
                    if job_data.get('job_id') == job_id:
                        return job_data
            except Exception as e:
                logger.error(f"Error reading job file {filename}: {e}")
        
        return None

    def delete_job(self, job_id: str) -> bool:
        """
        Delete a job file by its ID.
        Returns True if successful, False otherwise.
        """
        if not os.path.exists(OUTPUT_DIR):
            return False
        
        for filename in os.listdir(OUTPUT_DIR):
            if not filename.startswith('job_') or not filename.endswith('.json'):
                continue
            
            filepath = os.path.join(OUTPUT_DIR, filename)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    job_data = json.load(f)
                    if job_data.get('id') == job_id:
                        os.remove(filepath)
                        logger.info(f"Deleted job file: {filepath}")
                        return True
            except Exception as e:
                logger.error(f"Error deleting job file {filename}: {e}")
        
        return False


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
        user_id: str = 'anon'
    ) -> Optional[str]:
        """
        Extract detailed job from note data and save it.
        
        Args:
            session_id: Session identifier
            title: Job title from save_note_tool
            description: Job description from save_note_tool
            details: List of key details from save_note_tool
            
        Returns:
            Filepath if successful, None otherwise
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
            job = await self.extractor.extract_from_text(job_text)
            
            if not job:
                logger.warning(f"No jobs extracted from note: {title}")
                return None
            
            # Save to JSON with your schema
            filepath = await self.extractor.save_to_individual_file(
                job,
                session_id=session_id,
                user_id=user_id
            )
            
            if filepath:
                logger.info(f"Sucessfully saved job to :{filepath}")
                return filepath
            else:
                logger.info("No new job files created (duplicates)")
                return None
            
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
    
    # Example: Detailed painting job
    title = "Living Room and Dining Room Painting"
    description = "Paint two adjacent rooms with different colors. Living room needs ceiling work and window trim painting."
    details = [
        "Living room: 15x20 ft, 10 ft ceilings",
        "Paint color: Benjamin Moore 'Edgecomb Gray'",
        "Dining room: 12x14 ft, 10 ft ceilings",
        "Paint color: White dove"
    ]
    
    filepath = await tracker.extract_and_save_from_note(
        session_id="test_painting_123",
        title=title,
        description=description,
        details=details
    )
    
    if filepath:
        print("\n" + "="*60)
        print("EXTRACTION SUCCESSFUL")
        print("="*60)
        print(f"Saved to: {filepath}")
        
        # Show the content
        with open(filepath, 'r') as f:
            data = json.load(f)
            print(f"\nExtracted Job Data:")
            print(json.dumps(data, indent=2))
    
    # Show all jobs
    print("\n" + "="*60)
    print("ALL JOBS")
    print("="*60)
    all_jobs = tracker.extractor.get_all_jobs()
    print(f"Total jobs: {len(all_jobs)}")
    for job in all_jobs:
        print(f"  - [{job.get('category', 'unknown')}] {job.get('title', 'No title')}")



if __name__ == "__main__":
    asyncio.run(example_extraction())