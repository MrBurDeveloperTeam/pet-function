export type SnabbbDiagnosticEventType =
  | 'snai_chat_submitted'
  | 'snai_chat_answered'
  | 'snai_chat_failed'
  | 'snai_fallback_used'
  | 'snai_request_started'
  | 'snai_request_succeeded'
  | 'snai_request_failed'
  | 'pet_dialogue_evaluated'
  | 'pet_dialogue_selected'
  | 'pet_dialogue_shown'
  | 'pet_dialogue_closed'
  | 'pet_dialogue_action_clicked';

export interface SnabbbDiagnosticEvent {
  eventId: string;
  eventType: SnabbbDiagnosticEventType;
  occurredAt: string;
  sessionId: string;
  appId?: string;
  requestId?: string;
  mode?: string;
  outcome?: 'success' | 'failure' | 'fallback';
  errorCode?: string;
  retryable?: boolean;
  latencyMs?: number;
  dialogueId?: string;
  triggerId?: string;
  ruleVersion?: string;
  evaluatedAt?: string;
  reasonCode?: string;
  candidateCount?: number;
  eligibleCount?: number;
  actionType?: string;
  dialogType?: string;
}

declare global {
  interface Window {
    __SNABBB_DIAGNOSTIC_SINK__?: (event: SnabbbDiagnosticEvent) => void;
  }
}

const SESSION_KEY = 'snabbb:diagnostic-session';
let fallbackSessionId: string | null = null;

export function createDiagnosticId(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `${prefix}_${uuid ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
}

function getSessionId(): string {
  if (typeof window !== 'undefined') {
    try {
      const existing = window.sessionStorage.getItem(SESSION_KEY);
      if (existing) return existing;
      const created = createDiagnosticId('session');
      window.sessionStorage.setItem(SESSION_KEY, created);
      return created;
    } catch {
      // Storage can be unavailable in private/restricted browser contexts.
    }
  }
  fallbackSessionId ??= createDiagnosticId('session');
  return fallbackSessionId;
}

/**
 * Emits metadata only. Callers must never add prompts, replies, facts,
 * names, e-mails, tokens, record IDs, or other user/application content.
 */
export function emitSnabbbDiagnostic(
  event: Omit<SnabbbDiagnosticEvent, 'eventId' | 'occurredAt' | 'sessionId'>,
): SnabbbDiagnosticEvent {
  const detail: SnabbbDiagnosticEvent = {
    ...event,
    eventId: createDiagnosticId('event'),
    occurredAt: new Date().toISOString(),
    sessionId: getSessionId(),
  };

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<SnabbbDiagnosticEvent>('snabbb:diagnostic', { detail }));
    try {
      window.__SNABBB_DIAGNOSTIC_SINK__?.(detail);
    } catch {
      // A host-provided telemetry sink must never break the product UI.
    }
  }
  return detail;
}
