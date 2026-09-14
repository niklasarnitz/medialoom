export class ProviderError extends Error {
  readonly provider: string;
  readonly statusCode?: number;

  constructor(message: string, provider = 'tmdb', statusCode?: number) {
    super(message);
    this.name = 'ProviderError';
    this.provider = provider;
    this.statusCode = statusCode;
  }
}

export class ProviderConfigurationError extends ProviderError {
  constructor(message: string, provider = 'tmdb') {
    super(message, provider);
    this.name = 'ProviderConfigurationError';
  }
}

export class ProviderAuthenticationError extends ProviderError {
  constructor(message = 'Invalid or missing TMDb API key/token.', provider = 'tmdb') {
    super(message, provider, 401);
    this.name = 'ProviderAuthenticationError';
  }
}

export class ProviderNotFoundError extends ProviderError {
  constructor(resource: string, provider = 'tmdb') {
    super(`Resource not found on ${provider}: ${resource}`, provider, 404);
    this.name = 'ProviderNotFoundError';
  }
}

export class ProviderRateLimitError extends ProviderError {
  readonly retryAfterSeconds?: number;

  constructor(message = 'TMDb rate limit exceeded.', retryAfterSeconds?: number, provider = 'tmdb') {
    super(message, provider, 429);
    this.name = 'ProviderRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class ProviderNetworkError extends ProviderError {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown, provider = 'tmdb') {
    super(message, provider);
    this.name = 'ProviderNetworkError';
    this.cause = cause;
  }
}

export class ProviderResponseError extends ProviderError {
  readonly rawSnippet?: string;

  constructor(message: string, statusCode?: number, rawSnippet?: string, provider = 'tmdb') {
    super(message, provider, statusCode);
    this.name = 'ProviderResponseError';
    this.rawSnippet = rawSnippet;
  }
}
