import { z } from 'zod';
import type { NotesRepository, JobExtractor } from '../../application/streaming/streaming-service.js';
import { logger } from '../../shared/logger.js';
import { TOOL_NAMES } from '../../shared/constants.js';

const SaveNoteArgsSchema = z.object({
  title: z.string(),
  description: z.string(),
  details: z.array(z.string()),
  note_id: z.string().optional(),
});

export interface ToolDeps {
  notesRepository: NotesRepository;
  jobExtractor: JobExtractor;
  getNotes: () => unknown;
  sessionId: string;
}

export interface Tool {
  name: string;
  description: string;
  execute: (input: {
    title: string;
    description: string;
    details: string[];
    note_id?: string;
  }) => Promise<unknown>;
}

export function createSaveNoteTool(deps: ToolDeps): Tool {
  return {
    name: TOOL_NAMES.SAVE_NOTE,
    description: 'Save a completed Job Description to the database. Call this when the user wants to save the job information.',
    execute: async (input: unknown) => {
      const parsed = SaveNoteArgsSchema.safeParse(input);
      if (!parsed.success) {
        logger.error({ input, error: parsed.error.format() }, 'Invalid save_note arguments');
        throw new Error(`Invalid save_note arguments: ${parsed.error.message}`);
      }
      const { title, description, details, note_id } = parsed.data;

      logger.info({ title, note_id }, 'Tool called: save_note');

      try {
        // Save to notes repository
        const note = deps.notesRepository.saveNote(title, description, details, note_id);

        // Trigger job extraction asynchronously
        deps.jobExtractor
          .extractFromNote(deps.sessionId, title, description, details)
          .catch((err) => {
            logger.error({ error: err, sessionId: deps.sessionId }, 'Job extraction failed');
          });

        return note;
      } catch (error) {
        logger.error({ error }, 'Failed to save note');
        throw error;
      }
    },
  };
}

export function createTools(deps: ToolDeps): Tool[] {
  return [
    createSaveNoteTool(deps),
  ];
}