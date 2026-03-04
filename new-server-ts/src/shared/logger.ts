import pino from 'pino';

export interface LogContext {
  sessionId?: string;
  connectionId?: string;
  userId?: string;
  [key: string]: string | undefined;
}

const logLevel = process.env.LOG_LEVEL || 'info';
const nodeEnv = process.env.NODE_ENV || 'production';

function createTransport() {
  if (nodeEnv !== 'development') return undefined;
  try {
    return pino.transport({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname',
        append: true,
      },
    });
  } catch {
    // Bundled environment (e.g. Next.js webpack) — fall back to JSON output
    return undefined;
  }
}

const transport = createTransport();

const logger = pino({
  level: logLevel,
  formatters: {
    log(object: Record<string, unknown>) {
      return object;
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: '@vcmach/adk-notes-capture-server',
  },
}, transport);

export function createLogger(context?: LogContext) {
  if (!context || Object.keys(context).length === 0) {
    return logger;
  }

  return logger.child(context);
}

export function bindLogger(
  logger: pino.Logger,
  context: LogContext
): pino.Logger {
  return logger.child(context);
}

// Log levels with typed payloads
export const log = {
  info(message: string, payload?: object): void {
    if (payload) {
      logger.info(payload, message);
    } else {
      logger.info(message);
    }
  },

  warn(message: string, payload?: object): void {
    if (payload) {
      logger.warn(payload, message);
    } else {
      logger.warn(message);
    }
  },

  error(message: string, error?: Error, payload?: object): void {
    const logPayload = error
      ? { message: error.message, stack: error.stack, ...payload }
      : payload;
    logger.error(logPayload, message);
  },

  debug(message: string, payload?: object): void {
    if (payload) {
      logger.debug(payload, message);
    } else {
      logger.debug(message);
    }
  },

  trace(message: string, payload?: object): void {
    if (payload) {
      logger.trace(payload, message);
    } else {
      logger.trace(message);
    }
  },
};

// Re-export pino logger for direct use
export { logger };