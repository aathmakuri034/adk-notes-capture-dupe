/**
 * Extraction Prompt Builder
 *
 * Builds prompts for job extraction from voice note text.
 * Uses prompt isolation with XML tags to mitigate prompt injection.
 */

// Maximum input length to prevent excessive API costs
const MAX_INPUT_LENGTH = 50000;

/**
 * Builds an extraction prompt for the given text
 *
 * @param text - The voice note text to extract job data from
 * @returns A prompt string for Gemini
 */
export function buildExtractionPrompt(text: string): string {
  // Truncate input to prevent excessive costs
  const truncatedText = text.length > MAX_INPUT_LENGTH
    ? text.slice(0, MAX_INPUT_LENGTH) + '\n[...truncated due to length...]'
    : text;

  return `You are a job extraction assistant. Your task is to extract structured job information from the user's voice note below.

## Instructions
- Extract as much information as possible from the provided text
- Use "unknown" for fields that cannot be determined
- Use sensible defaults for required fields when information is not provided
- Return ONLY valid JSON, no explanations or markdown

## Output Format
Return a JSON object with these fields:

### Common Fields (all jobs)
- category: One of "painting", "electrical", "plumbing", "hvac", "general"
- title: Brief title of the job
- description: High-level summary of the job
- location_type: One of "indoor", "outdoor", "both"
- specific_location: Room/area where work is needed
- urgency: One of "low", "medium", "high", "emergency" (default: "medium")
- complexity: One of "basic", "intermediate", "complex" (default: "intermediate")
- estimated_duration_minutes: Estimated duration in minutes (minimum 0)
- problem_type: Specific problem type
- key_details: Array of important details

### Painting-specific fields (if category is "painting")
- number_of_rooms: Number of rooms to paint
- ceiling_height: Ceiling height in feet
- room_size: Approximate room dimensions (e.g., "12x15 ft")
- number_of_walls: Total number of walls
- number_of_doors: Number of doors to paint
- number_of_windows: Number of windows to paint around
- paint_colors: Array of desired paint colors
- surface_condition: Current condition of surfaces
- prep_work_needed: Required prep work (patching, sanding, etc.)

### Electrical-specific fields (if category is "electrical")
- installation_type: Type of electrical work (panel, outlet, EV charger, etc.)
- number_of_outlets: Number of outlets/plugs needed
- voltage_requirement: Voltage requirement (e.g., 120V, 240V)
- amperage: Required amperage
- has_existing_panel: Whether there's an existing electrical panel
- panel_capacity: Current panel capacity
- desired_location: Where the work should be performed
- current_wiring: Description of current wiring situation
- permits_required: Whether permits are needed

### Plumbing-specific fields (if category is "plumbing")
- issue_type: Type of plumbing issue (leak, clog, installation, etc.)
- fixture_type: Type of fixture (sink, toilet, shower, etc.)
- severity: Severity of the issue (minor, moderate, severe)
- water_damage: Whether there's visible water damage
- water_shut_off: Whether water has been shut off
- access_difficulty: Difficulty of accessing the problem area
- age_of_plumbing: Approximate age of plumbing system

### HVAC-specific fields (if category is "hvac")
- system_type: Type of HVAC system (AC, heater, heat pump, etc.)
- issue_type: Type of issue (no cooling/heating, strange noise, etc.)
- system_age: Age of HVAC system in years
- last_service_date: When system was last serviced
- brand_model: Brand and model of HVAC system
- square_footage: Square footage of space to heat/cool
- filter_change_frequency: How often filters are changed
- thermostat_type: Type of thermostat (manual, programmable, smart)

### General-specific fields (if category is "general")
- work_type: Type of general work needed
- materials_needed: Array of materials required
- estimated_scope: Estimated scope of work
- special_requirements: Any special requirements or constraints

## User Input
<user_input>
${truncatedText}
</user_input>

## JSON Output
Return your response as a valid JSON object.`;
}
