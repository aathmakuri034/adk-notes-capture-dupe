import type pino from 'pino';
import type { GeminiLiveClient, StreamingSession } from './types.js';

export interface SessionManagerDeps {
  logger: pino.Logger;
  createGeminiClient: (connectionId: string, sessionId: string) => GeminiLiveClient;
}

export class SessionManager {
  private readonly logger: pino.Logger;
  private readonly createGeminiClient: (connectionId: string, sessionId: string) => GeminiLiveClient;
  private readonly sessions = new Map<string, StreamingSession>();
  private readonly clients = new Map<string, GeminiLiveClient>();

  constructor(deps: SessionManagerDeps) {
    this.logger = deps.logger;
    this.createGeminiClient = deps.createGeminiClient;
  }

  createSession(connectionId: string): StreamingSession {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    const userId = `user_${connectionId}`;

    const session: StreamingSession = {
      connectionId,
      sessionId,
      userId,
    };

    const client = this.createGeminiClient(connectionId, sessionId);
    this.clients.set(connectionId, client);
    this.sessions.set(connectionId, session);

    this.logger.info({ connectionId, sessionId, userId }, 'Created streaming session');
    return session;
  }

  getClient(connectionId: string): GeminiLiveClient | undefined {
    return this.clients.get(connectionId);
  }

  getSession(connectionId: string): StreamingSession | undefined {
    return this.sessions.get(connectionId);
  }

  async disconnect(connectionId: string): Promise<void> {
    const client = this.clients.get(connectionId);
    if (client) {
      await client.disconnect();
      this.clients.delete(connectionId);
    }

    const session = this.sessions.get(connectionId);
    if (session) {
      this.sessions.delete(connectionId);
      this.logger.info({ connectionId, sessionId: session.sessionId }, 'Removed session');
    }

    this.logger.info({ connectionId }, 'Disconnected session');
  }

  async disconnectAll(): Promise<void> {
    const connectionIds = [...this.clients.keys()];
    await Promise.allSettled(
      connectionIds.map((id) => this.disconnect(id))
    );
    this.logger.info({ count: connectionIds.length }, 'Disconnected all sessions');
  }
}
