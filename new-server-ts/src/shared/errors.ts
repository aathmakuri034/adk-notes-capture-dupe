// Base error class for the application
export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly cause?: unknown;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    cause?: unknown
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.cause = cause;

    // Maintains proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON(): object {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
    };
  }
}

// Validation errors (input validation, schema validation)
export class ValidationError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, true, cause);
  }
}

// External API errors (Gemini API, Azure, etc.)
export class ExternalApiError extends AppError {
  public readonly service: string;

  constructor(message: string, service: string, cause?: unknown) {
    super(message, 'EXTERNAL_API_ERROR', 502, true, cause);
    this.service = service;
  }

  toJSON(): object {
    return {
      ...super.toJSON(),
      service: this.service,
    };
  }
}

// Persistence errors (database, file storage)
export class PersistenceError extends AppError {
  public readonly operation: string;

  constructor(message: string, operation: string, cause?: unknown) {
    super(message, 'PERSISTENCE_ERROR', 500, true, cause);
    this.operation = operation;
  }

  toJSON(): object {
    return {
      ...super.toJSON(),
      operation: this.operation,
    };
  }
}

// Transport errors (WebSocket, HTTP)
export class TransportError extends AppError {
  public readonly connectionId?: string;

  constructor(message: string, connectionId?: string, cause?: unknown) {
    super(message, 'TRANSPORT_ERROR', 500, true, cause);
    this.connectionId = connectionId;
  }

  toJSON(): object {
    return {
      ...super.toJSON(),
      connectionId: this.connectionId,
    };
  }
}

// Helper to wrap external errors
export function wrapError(
  error: unknown,
  context: string,
  ErrorClass: new (message: string, context: string, cause?: unknown) => AppError
): AppError {
  if (error instanceof AppError) {
    return error;
  }

  const message = error instanceof Error ? error.message : 'Unknown error';
  return new ErrorClass(context, message, error);
}