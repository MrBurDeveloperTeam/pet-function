import { SnaiError, isSnaiErrorCode, toSnaiError } from '../errors';
import { createDiagnosticId, emitSnabbbDiagnostic } from '../../observability';

export const SHARED_SNAI_ENDPOINT = 'https://app.snabbb.com/api/snai/chat';

export type SnaiAppId =
  | 'superapp'
  | 'inventory'
  | 'appointment'
  | 'image-generator'
  | 'calculator'
  | 'todo'
  | 'elearning';

type SnaiResponseError = {
  code?: string;
  message?: string;
  userMessage?: string;
  retryable?: boolean;
  requestId?: string;
};

type SnaiResponse = Record<string, any> & {
  ok?: boolean;
  requestId?: string;
  error?: string | SnaiResponseError;
};

function errorFromResponse(data: SnaiResponse | null | undefined, invokeError: any, requestId: string): SnaiError {
  const payload = data?.error;
  const structured = payload && typeof payload === 'object' ? payload : null;
  const status = Number(invokeError?.context?.status ?? invokeError?.status) || undefined;
  const code = structured?.code;
  const message = structured?.message || structured?.userMessage || (typeof payload === 'string' ? payload : '') || invokeError?.message || 'AI service request failed';

  if (isSnaiErrorCode(code)) {
    return new SnaiError(code, message, {
      retryable: Boolean(structured?.retryable),
      requestId: structured?.requestId || data?.requestId || requestId,
      status,
      cause: invokeError,
    });
  }
  if (status === 401 || status === 403) {
    return new SnaiError('AUTH_SESSION_EXPIRED', message, { requestId, status, cause: invokeError });
  }
  if (status === 429) {
    return new SnaiError('AI_RATE_LIMITED', message, { retryable: true, requestId, status, cause: invokeError });
  }
  if (status === 408 || status === 504) {
    return new SnaiError('AI_TIMEOUT', message, { retryable: true, requestId, status, cause: invokeError });
  }
  if (status && status >= 500) {
    return new SnaiError('AI_UNAVAILABLE', message, { retryable: true, requestId, status, cause: invokeError });
  }
  if (status && status >= 400) {
    return new SnaiError('INVALID_REQUEST', message, { requestId, status, cause: invokeError });
  }
  return toSnaiError(invokeError ?? new Error(message));
}

/**
 * The host supplies only its authenticated Supabase client. A fresh session is
 * read for every request and its bearer token is sent only in the Authorization
 * header to the central Cloudflare Worker. The token is never serialized into
 * the request body or exposed to an app adapter.
 */
export function createAuthorizedSnaiTransport(
  supabase: any,
  appId: SnaiAppId,
  fetchImpl: typeof globalThis.fetch = (...args) => globalThis.fetch(...args),
) {
  return async function invokeSnai(payload: Record<string, unknown>): Promise<SnaiResponse> {
    const requestId = createDiagnosticId('snai');
    const mode = typeof payload.mode === 'string' ? payload.mode : 'unknown';
    const startedAt = Date.now();
    if (!supabase?.auth?.getSession || typeof fetchImpl !== 'function') {
      const error = new SnaiError('CONFIGURATION_ERROR', 'SNAI requires an authenticated Supabase client', { requestId });
      emitSnabbbDiagnostic({ eventType: 'snai_request_failed', appId, requestId, mode, outcome: 'failure', errorCode: error.code, retryable: error.retryable, latencyMs: 0 });
      throw error;
    }

    emitSnabbbDiagnostic({ eventType: 'snai_request_started', appId, requestId, mode });
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        throw new SnaiError('AUTH_UNAVAILABLE', sessionError.message || 'Unable to read the current login session', {
          retryable: true,
          requestId,
          cause: sessionError,
        });
      }

      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        throw new SnaiError('AUTH_REQUIRED', 'No active login session', { requestId, status: 401 });
      }

      const response = await fetchImpl(SHARED_SNAI_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'x-snai-request-id': requestId,
        },
        body: JSON.stringify({ appId, ...payload }),
      });

      const responseRequestId = response.headers?.get?.('x-snai-request-id') || requestId;
      let data: SnaiResponse | null = null;
      try {
        data = await response.json() as SnaiResponse;
      } catch (parseError) {
        throw new SnaiError('AI_UNAVAILABLE', 'SNAI returned an invalid response', {
          retryable: response.status >= 500,
          requestId: responseRequestId,
          status: response.status,
          cause: parseError,
        });
      }

      if (!response.ok || !data?.ok) {
        throw errorFromResponse(data, {
          status: response.status,
          message: `SNAI request failed with HTTP ${response.status}`,
        }, responseRequestId);
      }

      emitSnabbbDiagnostic({ eventType: 'snai_request_succeeded', appId, requestId: data.requestId || responseRequestId, mode, outcome: 'success', latencyMs: Date.now() - startedAt });
      return data as SnaiResponse;
    } catch (cause) {
      const error = cause instanceof SnaiError ? cause : toSnaiError(cause);
      emitSnabbbDiagnostic({ eventType: 'snai_request_failed', appId, requestId: error.requestId || requestId, mode, outcome: 'failure', errorCode: error.code, retryable: error.retryable, latencyMs: Date.now() - startedAt });
      throw error;
    }
  };
}
