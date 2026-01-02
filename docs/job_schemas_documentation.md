# Job Schemas Documentation

## Overview

The job extraction system uses a comprehensive schema architecture defined in `schema.py` and `subjob_schema.py` to structure home repair job data. This system provides both high-level categorization and detailed subjob classification for precise job matching and contractor routing.

## Schema Architecture

### Base Schema (schema.py)

The base schema defines the fundamental structure for all job types:

#### Shared Enums

**`JobCategory`**

- `PAINTING`: Painting and finishing work
- `ELECTRICAL`: Electrical installations and repairs
- `PLUMBING`: Plumbing systems and fixtures
- `HVAC`: Heating, ventilation, and air conditioning
- `GENERAL`: General home repair and maintenance

**`UrgencyLevel`**

- `LOW`: Non-urgent, can be scheduled
- `MEDIUM`: Should be addressed soon
- `HIGH`: Needs prompt attention
- `EMERGENCY`: Immediate action required

**`LocationType`**

- `INDOOR`: Work performed inside the home
- `OUTDOOR`: Work performed outside the home
- `BOTH`: Work spans indoor and outdoor areas

**`ComplexityLevel`**

- `BASIC`: Simple, straightforward tasks (60-90 minutes)
- `INTERMEDIATE`: Moderate complexity (120-180 minutes)
- `COMPLEX`: Advanced or extensive work (240+ minutes)

#### Base Job Model

The `BaseJob` class provides common fields for all job types:

- **Identifiers**: `session_id`, `job_id`, `user_id`
- **Core Fields**: `category`, `title`, `description`
- **Location**: `location_type`, `specific_location`
- **Metadata**: `urgency`, `complexity`, `estimated_duration_minutes`, `problem_type`
- **Context**: `customer_notes`, `tools_needed`, `key_details`
- **Media**: `has_images`, `has_video`, `visual_analysis`
- **Timestamps**: `created_at`, `last_updated`

#### Specialized Job Models

Each category has a specialized model extending `BaseJob`:

**`PaintingJob`**

- Room details: `number_of_rooms`, `ceiling_height`, `room_size`
- Surface details: `number_of_walls`, `number_of_doors`, `number_of_windows`
- Paint details: `paint_colors`, `surface_condition`, `prep_work_needed`

**`ElectricalJob`**

- Work type: `installation_type`
- Electrical specs: `number_of_outlets`, `voltage_requirement`, `amperage`
- Panel info: `has_existing_panel`, `panel_capacity`
- Location and permits: `desired_location`, `current_wiring`, `permits_required`

**`PlumbingJob`**

- Issue details: `issue_type`, `fixture_type`, `severity`
- Damage assessment: `water_damage`, `water_shut_off`
- Access and system: `access_difficulty`, `age_of_plumbing`

**`HVACJob`**

- System details: `system_type`, `issue_type`, `system_age`
- Service history: `last_service_date`, `brand_model`
- Space details: `square_footage`, `filter_change_frequency`, `thermostat_type`

**`GeneralJob`**

- Flexible fields: `work_type`, `materials_needed`, `estimated_scope`, `special_requirements`

## Subjob Schema (subjob_schema.py)

The subjob schema provides detailed, specific job classifications within each category. Each subjob type includes specialized fields relevant to that particular type of work.

### Plumbing Subjobs

**`BurstPipeJob`** (Emergency)

- `sub_job_type`: "Burst Pipe"
- `urgency`: Always EMERGENCY
- `pipe_location`: Basement, kitchen, etc.
- `pipe_type`: Copper, PVC, PEX, Galvanized
- `water_type_shutoff`: Main water shut off status
- `flooding_extent`: Minor, moderate, severe

**`DrainCleaningJob`**

- `sub_job_type`: "Drain Cleaning"
- `drain_location`: Kitchen, bathroom, shower
- `clog_severity`: Completely blocked or slow draining
- `recurring_issue`: Does this happen frequently?

**`WaterHeaterJob`**

- `sub_job_type`: "Water Heater"
- `heater_type`: Tank or Tankless
- `heater_age`: Age in years
- `heater_capacity`: Capacity in gallons
- `fuel_type`: Gas or Electric
- `heater_issue_description`: No hot water, leaking, noises

**`FixtureReplacementJob`**

- `sub_job_type`: "Fixture Replacement"
- `fixture_to_replace`: Sink, toilet, faucet, shower
- `new_fixture_provided`: Customer has new fixture
- `fixture_model`: Brand and model if known
- `reason_for_replacement`: Broken, leaking, upgrade

**`SewerLineJob`** (Complex)

- `sub_job_type`: "Sewer Line"
- `complexity`: Always COMPLEX
- `sewer_issue_type`: Backup, blockage, damage, root intrusion
- `sewage_backup_location`: Where sewage is backed up
- `camera_inspection_needed`: Camera inspection required
- `property_access`: Yard, driveway, under house

### Electrical Subjobs

**`OutletRepairJob`**

- `sub_job_type`: "Outlet Repair"
- `outlet_issue`: Not working, sparking, loose, burned
- `outlet_location`: Kitchen, bedroom, garage
- `outlet_type_needed`: Standard, GFCI, USB
- `outlets_affected`: Number of outlets to repair

**`WiringProblemsJob`**

- `sub_job_type`: "Wiring Problems"
- `wiring_issue`: Flickering lights, dead outlets, buzzing
- `affected_circuits`: Which rooms/circuits affected
- `visible_damage`: Can damaged wiring be seen
- `safety_concern`: Burning smell, sparks, etc.

**`CodeComplianceJob`**

- `sub_job_type`: "Code Compliance"
- `compliance_reason`: Home sale, inspection, insurance, renovation
- `violations_identified`: Known code violations
- `inspection_report_available`: Have inspection report

**`LightingSystemsJob`**

- `sub_job_type`: "Lighting Systems"
- `lighting_type`: Recessed, pendant, chandelier, landscape
- `number_of_fixtures`: Number of light fixtures
- `rooms_for_lighting`: Which rooms
- `dimmer_switches`: Install dimmer switches

**`CeilingFanJob`**

- `sub_job_type`: "Ceiling Fans"
- `number_of_fans`: Number of ceiling fans
- `fan_locations`: Bedroom, living room, etc.
- `existing_wiring`: Ceiling wiring already present
- `fan_provided`: Customer has the fan

### HVAC Subjobs

**`ACInstallationRepairJob`**

- `sub_job_type`: "AC Installation/Repair"
- `service_type`: Installation, repair, or replacement
- `ac_issue`: Not cooling, not turning on, noisy
- `system_tonnage`: Tonnage if known
- `outdoor_unit_running`: Outdoor unit running status

**`RefrigerantRechargingJob`**

- `sub_job_type`: "Refrigerant Recharging"
- `refrigerant_type`: R-22, R-410A, etc.
- `suspected_leak`: Suspected leak present
- `cooling_performance`: Not cooling, weak cooling

**`DuctCleaningJob`**

- `sub_job_type`: "Duct Cleaning and Sealing"
- `last_cleaning`: When ducts last cleaned
- `visible_mold`: Mold visible in ducts
- `airflow_issues`: Uneven airflow between rooms
- `sealing_needed`: Duct sealing needed

**`HumidifierJob`**

- `sub_job_type`: "Humidifier"
- `humidifier_type`: Whole house, portable, steam, bypass
- `install_or_repair`: New installation or repair existing
- `humidity_issues`: Dry skin, static, wood cracking

**`FilterReplacementJob`** (Basic)

- `sub_job_type`: "Filter Replacement"
- `complexity`: Always BASIC
- `filter_type_needed`: Standard, HEPA, electrostatic
- `filter_size`: Filter dimensions
- `subscription_service`: Interested in regular service

### Painting Subjobs

**`WallCeilingPaintingJob`**

- `sub_job_type`: "Wall Ceiling Painting"
- `rooms_to_paint`: Living room, bedroom, kitchen
- `paint_ceilings`: Paint ceilings too
- `paint_trim`: Paint trim/baseboards

**`CabinetRefinishingJob`**

- `sub_job_type`: "Cabinet Refinishing"
- `cabinet_location`: Kitchen, bathroom, laundry
- `number_of_cabinets`: Number of cabinet units
- `finish_type`: Paint, stain, or refinish
- `hardware_replacement`: Replace knobs/handles

**`WallpaperServicesJob`**

- `sub_job_type`: "Wallpaper Services"
- `service_type`: Installation, removal, or both
- `rooms_for_wallpaper`: Which rooms
- `wallpaper_provided`: Customer has wallpaper
- `walls_to_cover`: Number of walls

**`ExteriorHousePaintingJob`** (Outdoor)

- `sub_job_type`: "Exterior House Painting"
- `location_type`: Always OUTDOOR
- `house_stories`: Number of stories
- `siding_type`: Wood, vinyl, brick, stucco
- `approximate_square_feet`: Exterior square footage
- `trim_included`: Paint trim and shutters

**`DeckPaintingJob`** (Outdoor)

- `sub_job_type`: "Deck Painting/Stain"
- `location_type`: Always OUTDOOR
- `deck_size`: Approximate dimensions (e.g., 12x20 ft)
- `finish_type`: Paint, stain, or seal
- `deck_material`: Wood type or composite
- `railings_included`: Stain/paint railings

### General Subjobs

**`InspectionsJob`**

- `sub_job_type`: "Inspections"
- `inspection_type`: Pre-purchase, maintenance, insurance
- `property_age`: Age of property in years
- `specific_concerns`: Foundation, roof, electrical, etc.

**`PermitProcurementJob`**

- `sub_job_type`: "Permit Procurement"
- `permit_type`: Building, electrical, plumbing
- `project_description`: What project needs permit
- `jurisdiction`: City and county

**`HomeAdditionsJob`** (Complex)

- `sub_job_type`: "Home Additions"
- `complexity`: Always COMPLEX
- `addition_type`: Room, second story, sunroom, garage
- `approximate_square_feet`: Size of addition
- `foundation_needed`: New foundation required

**`DisasterRecoveryJob`** (High Urgency)

- `sub_job_type`: "Disaster Recovery"
- `urgency`: HIGH or EMERGENCY
- `disaster_type`: Fire, flood, storm, wind damage
- `extent_of_damage`: Minor, moderate, or severe
- `insurance_claim`: Filing insurance claim
- `immediate_needs`: Board up, tarp, water removal, etc.

## Subjob Classification Process

### Primary Classification Attempt

When extracting job data, the system first attempts to classify the job into a specific subjob type:

1. **Category Identification**: AI first identifies the broad category (plumbing, electrical, etc.)
2. **Subjob Matching**: Attempts to match the job description to a specific subjob type within that category
3. **Field Population**: If a subjob match is found, populates both base fields and subjob-specific fields

### Fallback Behavior

When subjob classification fails or is not applicable:

1. **Validation Failure**: If the AI cannot identify a specific subjob type, or if the provided subjob type doesn't match available options
2. **Fallback to Base Model**: The system falls back to using the base category model (e.g., `PlumbingJob` instead of `BurstPipeJob`)
3. **Data Preservation**: All successfully extracted base fields are preserved
4. **Logging**: The system logs the fallback and continues processing

### Benefits of Subjob Classification

- **Precise Matching**: Contractors can be matched to jobs requiring their specific expertise
- **Accurate Pricing**: Subjob-specific fields enable more precise cost estimation
- **Better Scheduling**: Complexity and urgency levels help with proper job scheduling
- **Quality Assurance**: Detailed specifications reduce miscommunication

### When Subjobs Are Not Classified

Subjob classification may fail when:

- **Ambiguous Description**: Job description is too vague to identify a specific subjob type
- **Multiple Issues**: Job involves multiple different types of work
- **Non-Standard Work**: Job doesn't fit neatly into predefined subjob categories
- **AI Uncertainty**: AI model cannot confidently identify the specific subjob type

In these cases, the job is still successfully processed using the base category model, ensuring no jobs are lost while maintaining data quality for routing and estimation.
