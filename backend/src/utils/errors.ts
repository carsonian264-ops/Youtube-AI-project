/**
 * Typed application errors. Every error that should produce a specific
 * HTTP status/response shape extends AppError; anything else is treated
 * as an unexpected 500 by the central error handler and never leaks
 * internal detail to the client.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;
  public readonly isOperational = true;

  constructor(message: string, statusCode: number, code: string, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Request validation failed", details?: unknown) {
    super(message, 400, "VALIDATION_ERROR", details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Authentication required") {
    super(message, 401, "AUTHENTICATION_ERROR");
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "You do not have access to this resource") {
    super(message, 403, "AUTHORIZATION_ERROR");
  }
}

export class NotFoundError extends AppError {
  constructor(resource = "Resource") {
    super(`${resource} not found`, 404, "NOT_FOUND");
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, "CONFLICT");
  }
}

export class InvalidStateTransitionError extends AppError {
  constructor(message: string) {
    super(message, 409, "INVALID_STATE_TRANSITION");
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests") {
    super(message, 429, "RATE_LIMIT_EXCEEDED");
  }
}

/**
 * Thrown when an upstream provider (Claude, OpenArt, TTS, S3, FFmpeg,
 * YouTube) fails. Kept distinct from AppError subtypes above so callers
 * can decide whether to retry.
 */
export class ProviderError extends AppError {
  public readonly provider: string;
  public readonly retryable: boolean;

  constructor(provider: string, message: string, retryable = true, details?: unknown) {
    super(`[${provider}] ${message}`, 502, "PROVIDER_ERROR", details);
    this.provider = provider;
    this.retryable = retryable;
  }
}

export class AIResponseValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 502, "AI_RESPONSE_VALIDATION_ERROR", details);
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
