import type pino from 'pino';
import type { GeminiLiveClient, StreamingSession } from './types.js';

export interface MediaForwarderDeps {
  logger: pino.Logger;
}

function parseDataUrl(input: string): { data: string; mimeType: string | null } {
  if (!input.includes(',')) {
    return { data: input, mimeType: null };
  }

  const commaIndex = input.indexOf(',');
  const header = input.substring(0, commaIndex);
  const data = input.substring(commaIndex + 1);

  if (header.includes('data:') && header.includes(';')) {
    const mimePart = header.split(':')[1];
    if (mimePart) {
      const mimeType = mimePart.split(';')[0] ?? null;
      return { data, mimeType };
    }
  }

  return { data, mimeType: null };
}

export class MediaForwarder {
  private readonly logger: pino.Logger;

  constructor(deps: MediaForwarderDeps) {
    this.logger = deps.logger;
  }

  async forwardAudio(client: GeminiLiveClient, session: StreamingSession, audioData: string): Promise<void> {
    const buffer = Buffer.from(audioData, 'base64');
    await client.sendAudio(buffer);
    this.logger.debug({ connectionId: session.connectionId, sessionId: session.sessionId, size: buffer.length }, 'Sent audio');
  }

  async forwardText(client: GeminiLiveClient, session: StreamingSession, text: string): Promise<void> {
    await client.sendText(text);
    this.logger.info({ connectionId: session.connectionId, sessionId: session.sessionId, text }, 'Sent text');
  }

  async forwardImage(client: GeminiLiveClient, session: StreamingSession, imageData: string, mimeType: string): Promise<void> {
    const parsed = parseDataUrl(imageData);
    const actualMimeType = parsed.mimeType ?? mimeType;

    const buffer = Buffer.from(parsed.data, 'base64');
    await client.sendImage(buffer, actualMimeType);
    this.logger.info({ connectionId: session.connectionId, sessionId: session.sessionId, mimeType: actualMimeType }, 'Sent image');
  }

  async forwardEndTurn(client: GeminiLiveClient): Promise<void> {
    await client.endTurn();
  }
}
