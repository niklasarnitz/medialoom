import { ErrorCode, type ExitCode, ExitCode as ExitCodes } from '@medialoom/contracts';
import { ProviderError } from '@medialoom/providers';
import { ZodError } from 'zod';

export class DomainError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly exitCode: ExitCode;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    options: {
      code?: string;
      statusCode?: number;
      exitCode?: ExitCode;
      details?: Record<string, unknown>;
    } = {},
  ) {
    super(message);
    this.name = 'DomainError';
    this.code = options.code ?? ErrorCode.INTERNAL_ERROR;
    this.statusCode = options.statusCode ?? 500;
    this.exitCode = options.exitCode ?? ExitCodes.GENERIC_FAILURE;
    this.details = options.details;
  }
}

export class ItemNotFoundError extends DomainError {
  constructor(itemId: string) {
    super(`MediaItem "${itemId}" not found in inventory.`, {
      code: ErrorCode.ITEM_NOT_FOUND,
      statusCode: 404,
      exitCode: ExitCodes.GENERIC_FAILURE,
      details: { itemId },
    });
    this.name = 'ItemNotFoundError';
  }
}

export class InvalidArgumentError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, {
      code: ErrorCode.INVALID_ARGUMENT,
      statusCode: 400,
      exitCode: ExitCodes.INVALID_INPUT,
      details,
    });
    this.name = 'InvalidArgumentError';
  }
}

export class InvalidConfigError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, {
      code: ErrorCode.INVALID_CONFIG,
      statusCode: 500,
      exitCode: ExitCodes.INVALID_INPUT,
      details,
    });
    this.name = 'InvalidConfigError';
  }
}

export class ReviewRequiredError extends DomainError {
  constructor(
    message = 'Item requires manual review before matching.',
    details?: Record<string, unknown>,
  ) {
    super(message, {
      code: ErrorCode.REVIEW_REQUIRED,
      statusCode: 422,
      exitCode: ExitCodes.REVIEW_REQUIRED,
      details,
    });
    this.name = 'ReviewRequiredError';
  }
}

export class ConflictError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, {
      code: ErrorCode.CONFLICT,
      statusCode: 409,
      exitCode: ExitCodes.CONFLICT,
      details,
    });
    this.name = 'ConflictError';
  }
}

export interface StructuredErrorResult {
  code: string;
  message: string;
  statusCode: number;
  exitCode: ExitCode;
  details?: Record<string, unknown>;
}

export function mapErrorToStructured(err: unknown): StructuredErrorResult {
  if (err instanceof DomainError) {
    return {
      code: err.code,
      message: err.message,
      statusCode: err.statusCode,
      exitCode: err.exitCode,
      details: err.details,
    };
  }

  if (err instanceof ZodError) {
    return {
      code: ErrorCode.INVALID_INPUT,
      message: err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
      statusCode: 400,
      exitCode: ExitCodes.INVALID_INPUT,
      details: { issues: err.issues },
    };
  }

  if (err instanceof ProviderError) {
    if (err.name === 'ProviderAuthenticationError') {
      return {
        code: ErrorCode.PROVIDER_AUTH_ERROR,
        message: err.message,
        statusCode: 502,
        exitCode: ExitCodes.PROVIDER_ERROR,
        details: { provider: err.provider },
      };
    }
    if (err.name === 'ProviderNotFoundError') {
      return {
        code: ErrorCode.PROVIDER_NOT_FOUND,
        message: err.message,
        statusCode: 404,
        exitCode: ExitCodes.PROVIDER_ERROR,
        details: { provider: err.provider },
      };
    }
    if (err.name === 'ProviderRateLimitError') {
      return {
        code: ErrorCode.PROVIDER_RATE_LIMIT,
        message: err.message,
        statusCode: 429,
        exitCode: ExitCodes.PROVIDER_ERROR,
        details: { provider: err.provider },
      };
    }
    if (err.name === 'ProviderNetworkError') {
      return {
        code: ErrorCode.PROVIDER_NETWORK_ERROR,
        message: err.message,
        statusCode: 502,
        exitCode: ExitCodes.PROVIDER_ERROR,
        details: { provider: err.provider },
      };
    }
    return {
      code: ErrorCode.PROVIDER_ERROR,
      message: err.message,
      statusCode: err.statusCode ?? 502,
      exitCode: ExitCodes.PROVIDER_ERROR,
      details: { provider: err.provider },
    };
  }

  const message = err instanceof Error ? err.message : String(err);

  // Check if message matches common domain patterns
  if (message.includes('not found in inventory') || message.includes('Item not found')) {
    return {
      code: ErrorCode.ITEM_NOT_FOUND,
      message,
      statusCode: 404,
      exitCode: ExitCodes.GENERIC_FAILURE,
    };
  }

  return {
    code: ErrorCode.INTERNAL_ERROR,
    message,
    statusCode: 500,
    exitCode: ExitCodes.GENERIC_FAILURE,
  };
}
