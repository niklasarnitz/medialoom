import { mapErrorToStructured } from '@medialoom/core';

export function jsonSuccess<T>(data: T, status = 200): Response {
  return new Response(
    JSON.stringify(
      {
        schemaVersion: 1,
        status: 'success',
        data,
      },
      (_key, value) => (typeof value === 'bigint' ? Number(value) : value),
    ),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
      },
    },
  );
}

export function jsonError(err: unknown): Response {
  const structured = mapErrorToStructured(err);
  return new Response(
    JSON.stringify(
      {
        schemaVersion: 1,
        status: 'error',
        error: {
          code: structured.code,
          message: structured.message,
          ...(structured.details ? { details: structured.details } : {}),
        },
      },
      (_key, value) => (typeof value === 'bigint' ? Number(value) : value),
    ),
    {
      status: structured.statusCode,
      headers: {
        'Content-Type': 'application/json',
      },
    },
  );
}
