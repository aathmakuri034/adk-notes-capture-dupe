import type pino from 'pino';
import type { NotesRepository, JobSummaryService, Note } from './types.js';

export interface NotesHandlerDeps {
  logger: pino.Logger;
  notesRepository: NotesRepository;
  jobExtractor: JobSummaryService;
}

export class NotesHandler {
  private readonly logger: pino.Logger;
  private readonly notesRepository: NotesRepository;
  private readonly jobExtractor: JobSummaryService;

  constructor(deps: NotesHandlerDeps) {
    this.logger = deps.logger;
    this.notesRepository = deps.notesRepository;
    this.jobExtractor = deps.jobExtractor;
  }

  saveNote(sessionId: string, title: string, description: string, details: string[], noteId?: string): Note {
    const note = this.notesRepository.saveNote(title, description, details, noteId);
    this.logger.info({ sessionId, noteId: note.id }, 'Saved note');

    this.jobExtractor
      .extractFromNote(sessionId, title, description, details)
      .catch((err) => {
        this.logger.error({ sessionId, error: err }, 'Job extraction failed');
      });

    return note;
  }

  getNotes(): Note[] {
    return this.notesRepository.getNotes();
  }

  deleteNote(noteId: string): void {
    this.notesRepository.deleteNote(noteId);
    this.logger.info({ noteId }, 'Deleted note');
  }
}
