export type SnaiErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_SESSION_EXPIRED'
  | 'AUTH_UNAVAILABLE'
  | 'DATA_LOADING'
  | 'DATA_UNAVAILABLE'
  | 'UNSUPPORTED_QUESTION'
  | 'AI_RATE_LIMITED'
  | 'AI_TIMEOUT'
  | 'AI_UNAVAILABLE'
  | 'CONFIGURATION_ERROR'
  | 'NETWORK_ERROR'
  | 'INVALID_REQUEST'
  | 'UNKNOWN_ERROR';

export interface SnaiErrorOptions {
  retryable?: boolean;
  requestId?: string;
  status?: number;
  cause?: unknown;
}

export class SnaiError extends Error {
  readonly code: SnaiErrorCode;
  readonly retryable: boolean;
  readonly requestId?: string;
  readonly status?: number;
  readonly cause?: unknown;

  constructor(code: SnaiErrorCode, message: string, options: SnaiErrorOptions = {}) {
    super(message);
    this.name = 'SnaiError';
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.requestId = options.requestId;
    this.status = options.status;
    this.cause = options.cause;
  }
}

const VALID_CODES = new Set<SnaiErrorCode>([
  'AUTH_REQUIRED', 'AUTH_SESSION_EXPIRED', 'AUTH_UNAVAILABLE', 'DATA_LOADING',
  'DATA_UNAVAILABLE', 'UNSUPPORTED_QUESTION', 'AI_RATE_LIMITED', 'AI_TIMEOUT',
  'AI_UNAVAILABLE', 'CONFIGURATION_ERROR', 'NETWORK_ERROR', 'INVALID_REQUEST',
  'UNKNOWN_ERROR',
]);

export function isSnaiErrorCode(value: unknown): value is SnaiErrorCode {
  return typeof value === 'string' && VALID_CODES.has(value as SnaiErrorCode);
}

export function toSnaiError(error: unknown): SnaiError {
  if (error instanceof SnaiError) return error;
  const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  const lower = message.toLowerCase();
  if (lower.includes('jwt') || lower.includes('session') || lower.includes('unauthorized')) {
    return new SnaiError('AUTH_SESSION_EXPIRED', message, { cause: error });
  }
  if (lower.includes('fetch') || lower.includes('network') || lower.includes('connection')) {
    return new SnaiError('NETWORK_ERROR', message, { retryable: true, cause: error });
  }
  if (lower.includes('timeout') || lower.includes('aborted')) {
    return new SnaiError('AI_TIMEOUT', message, { retryable: true, cause: error });
  }
  return new SnaiError('UNKNOWN_ERROR', message, { retryable: true, cause: error });
}

export function getSnaiErrorUserMessage(error: SnaiError): string {
  switch (error.code) {
    case 'AUTH_REQUIRED':
      return 'Please log in before asking SNAI a question.';
    case 'AUTH_SESSION_EXPIRED':
      return 'Your login session has expired. Please log in again, then retry your question.';
    case 'AUTH_UNAVAILABLE':
      return 'Login verification is temporarily unavailable. Please try again shortly.';
    case 'DATA_LOADING':
      return 'Your app data is still loading. Please wait a moment and try again.';
    case 'DATA_UNAVAILABLE':
      return 'SNAI could not load the authorized app data needed for this question.';
    case 'UNSUPPORTED_QUESTION':
      return 'SNAI cannot answer that from the supported data in this app yet.';
    case 'AI_RATE_LIMITED':
      return 'SNAI is receiving too many requests right now. Please wait a moment and try again.';
    case 'AI_TIMEOUT':
      return 'SNAI took too long to respond. Please try again.';
    case 'CONFIGURATION_ERROR':
      return 'SNAI is not configured correctly yet. Please contact support.';
    case 'NETWORK_ERROR':
      return 'SNAI could not reach the service. Check your connection and try again.';
    case 'INVALID_REQUEST':
      return 'SNAI could not process this request. Please rephrase your question.';
    case 'AI_UNAVAILABLE':
    case 'UNKNOWN_ERROR':
    default:
      return 'SNAI is temporarily unavailable. Please try again shortly.';
  }
}
