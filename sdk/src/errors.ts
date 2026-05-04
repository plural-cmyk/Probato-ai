/**
 * Probato SDK - Custom Error Classes
 */

export class ProbatoError extends Error {
  public status: number;
  public code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ProbatoError";
    this.status = status;
    this.code = code;
  }
}

export class AuthenticationError extends ProbatoError {
  constructor(message: string = "Authentication required. Provide a valid API key.") {
    super(message, 401, "AUTH_REQUIRED");
    this.name = "AuthenticationError";
  }
}

export class RateLimitError extends ProbatoError {
  public retryAfter: number;
  public limit: number;
  public remaining: number;
  public resetAt: number;

  constructor(
    message: string,
    retryAfter: number,
    limit: number,
    remaining: number,
    resetAt: number
  ) {
    super(message, 429, "RATE_LIMITED");
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
    this.limit = limit;
    this.remaining = remaining;
    this.resetAt = resetAt;
  }
}

export class InsufficientCreditsError extends ProbatoError {
  public required: number;
  public balance: number;

  constructor(required: number, balance: number) {
    super(
      `Insufficient credits. Required: ${required}, Balance: ${balance}`,
      402,
      "INSUFFICIENT_CREDITS"
    );
    this.name = "InsufficientCreditsError";
    this.required = required;
    this.balance = balance;
  }
}

export class NotFoundError extends ProbatoError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class ForbiddenError extends ProbatoError {
  constructor(message: string) {
    super(message, 403, "FORBIDDEN");
    this.name = "ForbiddenError";
  }
}

export class ValidationError extends ProbatoError {
  public fields: Record<string, string>;

  constructor(message: string, fields: Record<string, string> = {}) {
    super(message, 400, "VALIDATION_ERROR");
    this.name = "ValidationError";
    this.fields = fields;
  }
}
