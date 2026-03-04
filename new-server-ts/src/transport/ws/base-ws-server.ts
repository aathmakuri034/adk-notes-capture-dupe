import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import { logger } from '../../shared/logger.js';
import { ValidationError, TransportError } from '../../shared/errors.js';
import { WS_CLOSE_CODES } from '../../shared/constants.js';
import {
  ServerMessage,
  serializeServerMessage,
  parseClientMessage,
} from '../../shared/ws-messages.js';

export interface Connection {
  id: string;
  socket: WebSocket;
  sessionId?: string;
  userId?: string;
  metadata: Record<string, unknown>;
}

export interface BaseWsServerConfig {
  host: string;
  port: number;
  maxPayload?: number;
  maxConsecutiveFailures?: number;
  maxConnections?: number;
  maxMessagesPerSecond?: number;
}

export abstract class BaseWsServer extends EventEmitter {
  protected server: WebSocketServer | null = null;
  protected connections: Map<string, Connection> = new Map();
  protected config: BaseWsServerConfig;
  protected isRunning = false;
  protected consecutiveFailures = 0;
  protected readonly maxConsecutiveFailures: number;
  protected readonly maxConnections: number;
  protected readonly maxMessagesPerSecond: number;
  private messageTimestamps: Map<string, number[]> = new Map();

  constructor(config: BaseWsServerConfig) {
    super();
    this.config = config;
    this.maxConsecutiveFailures = config.maxConsecutiveFailures ?? 5;
    this.maxConnections = config.maxConnections ?? 10;
    this.maxMessagesPerSecond = config.maxMessagesPerSecond ?? 100;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      throw new TransportError('Server is already running');
    }

    this.server = new WebSocketServer({
      host: this.config.host,
      port: this.config.port,
      maxPayload: this.config.maxPayload || 5 * 1024 * 1024,
    });

    this.server.on('listening', () => {
      this.isRunning = true;
      logger.info(`WebSocket server started on ${this.config.host}:${this.config.port}`);
      this.emit('listening');
    });

    this.server.on('connection', (socket, request) => {
      const connectionId = this.generateConnectionId();
      this.handleConnection(connectionId, socket, request);
    });

    this.server.on('error', (error) => {
      logger.error({ error }, 'WebSocket server error');
      this.emit('error', error);
    });

    this.server.on('close', () => {
      this.isRunning = false;
      logger.info('WebSocket server closed');
      this.emit('close');
    });

    // Wait for server to be ready
    return new Promise((resolve) => {
      if (this.server) {
        this.server.once('listening', () => resolve());
      } else {
        resolve();
      }
    });
  }

  async stop(): Promise<void> {
    if (!this.isRunning || !this.server) {
      return;
    }

    // Close all connections
    for (const [id, connection] of this.connections) {
      try {
        connection.socket.close(WS_CLOSE_CODES.GOING_AWAY, 'Server shutting down');
      } catch (error) {
        logger.debug({ connectionId: id, error }, 'Error closing connection during shutdown');
      }
      this.connections.delete(id);
    }

    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          this.isRunning = false;
          logger.info('WebSocket server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  protected generateConnectionId(): string {
    return `conn_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  protected async handleConnection(
    connectionId: string,
    socket: WebSocket,
    _request: unknown
  ): Promise<void> {
    if (this.connections.size >= this.maxConnections) {
      logger.warn({ connectionId, current: this.connections.size, max: this.maxConnections }, 'Connection rejected: max connections reached');
      socket.close(WS_CLOSE_CODES.TRY_AGAIN_LATER, 'Too many connections');
      return;
    }

    const connection: Connection = {
      id: connectionId,
      socket,
      metadata: {},
    };

    this.connections.set(connectionId, connection);
    logger.info({ connectionId }, 'New WebSocket connection');

    this.emit('connection', connection);

    try {
      await this.processConnection(connectionId, socket);
    } catch (error) {
      logger.error({ connectionId, error }, 'Error processing connection');
      this.handleConnectionError(connectionId, error);
    } finally {
      this.connections.delete(connectionId);
      this.messageTimestamps.delete(connectionId);
      logger.info({ connectionId }, 'Connection closed');
      this.emit('disconnection', connectionId);
    }
  }

  protected abstract processConnection(
    connectionId: string,
    socket: WebSocket
  ): Promise<void>;

  protected handleConnectionError(connectionId: string, error: unknown): void {
    const message = error instanceof Error ? error.message : 'Unknown error';
    this.sendToConnection(connectionId, {
      type: 'error',
      data: message,
    });
  }

  protected async processMessage(
    connectionId: string,
    data: string
  ): Promise<void> {
    // Rate limit messages per connection
    const now = Date.now();
    const timestamps = this.messageTimestamps.get(connectionId) ?? [];
    const windowStart = now - 1000;
    const recent = timestamps.filter((t) => t > windowStart);
    recent.push(now);
    this.messageTimestamps.set(connectionId, recent);

    if (recent.length > this.maxMessagesPerSecond) {
      logger.warn({ connectionId, count: recent.length, max: this.maxMessagesPerSecond }, 'Rate limit exceeded');
      this.sendToConnection(connectionId, { type: 'error', data: 'Rate limit exceeded' });
      return;
    }

    const msg = parseClientMessage(data);

    if (!msg) {
      throw new ValidationError('Invalid message format');
    }

    await this.handleMessage(connectionId, msg);
  }

  protected abstract handleMessage(
    connectionId: string,
    msg: ReturnType<typeof parseClientMessage>
  ): Promise<void>;

  sendToConnection(connectionId: string, message: ServerMessage): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    try {
      if (connection.socket.readyState === WebSocket.OPEN) {
        connection.socket.send(serializeServerMessage(message));
      }
    } catch (error) {
      logger.error({ connectionId, error }, 'Failed to send message');
    }
  }

  broadcast(message: ServerMessage): void {
    const serialized = serializeServerMessage(message);
    for (const connection of this.connections.values()) {
      try {
        if (connection.socket.readyState === WebSocket.OPEN) {
          connection.socket.send(serialized);
        }
      } catch (error) {
        logger.error({ connectionId: connection.id, error }, 'Failed to broadcast');
      }
    }
  }

  getConnection(connectionId: string): Connection | undefined {
    return this.connections.get(connectionId);
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Record a failure and check if shutdown is needed
   */
  public recordFailure(): void {
    this.consecutiveFailures++;
    logger.warn({ failures: this.consecutiveFailures, maxFailures: this.maxConsecutiveFailures }, 'Connection failure recorded');
    if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
      this.triggerShutdown();
    }
  }

  /**
   * Reset failure counter (call on successful operations)
   */
  public resetFailureCount(): void {
    if (this.consecutiveFailures > 0) {
      logger.info({ previousFailures: this.consecutiveFailures }, 'Failure count reset');
      this.consecutiveFailures = 0;
    }
  }

  /**
   * Get current failure count
   */
  public getFailureCount(): number {
    return this.consecutiveFailures;
  }

  /**
   * Trigger graceful shutdown due to health check failure
   */
  protected async triggerShutdown(): Promise<void> {
    logger.error(`Health check failed: ${this.maxConsecutiveFailures} consecutive failures. Shutting down.`);
    this.emit('healthcheck-failed');
    try {
      await this.stop();
    } catch (err) {
      logger.error({ error: err }, 'Error during shutdown');
    }
    process.exit(1);
  }
}
