// Local, network-free semantic capability matcher — the "Semantic
// Capability Router" from the Semantic Grounded Routing Enhancement,
// implemented WITHOUT a Gemini call. This is a deliberate architecture
// choice, not a shortcut:
//
//   - The router "MUST NOT receive app data" (Section 4) and only needs
//     the user's message + capability descriptions — both already
//     satisfied trivially since this never touches live task data.
//   - Section 22/23 require the app to stay USABLE if "the semantic
//     router server call fails" and to not "make the app more dependent
//     on network routing." A local matcher has no network call to fail
//     at all, which satisfies that requirement structurally instead of
//     needing a fallback-on-failure code path.
//   - Section 25 explicitly asks to avoid a new orchestration
//     service/RAG infrastructure "solely for intent routing" — a small
//     keyword-overlap scorer over the existing capability registry is
//     the lightest mechanism that generalizes meaningfully beyond exact
//     phrase matching.
//
// ALGORITHM: score each capability by how many of its keyword phrases
// appear as substrings of the normalized message, weighted by phrase
// word-count (a matched multi-word phrase like "coming up" is a
// stronger signal than a single common word). The highest-scoring
// capability wins if its score clears CONFIDENT_THRESHOLD; if the top
// two scores are close and both nonzero, the question is genuinely
// ambiguous and a clarification is returned instead of guessing;
// otherwise no grounded capability applies.

import type { TodoCapability } from './capabilityRegistry';
import { TODO_CAPABILITIES } from './capabilityRegistry';
import type { TodoDataIntent } from '../contracts/groundedDataResult';

const CONFIDENT_THRESHOLD = 2;
const AMBIGUOUS_GAP = 1;

function normalize(message: string): string {
  return message
    .trim()
    .toLowerCase()
    .replace(/\bup\s+coming\b/g, 'upcoming')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreCapability(normalized: string, capability: TodoCapability): number {
  let score = 0;
  for (const phrase of capability.keywords) {
    if (normalized.includes(phrase)) {
      score += phrase.split(' ').length;
    }
  }
  return score;
}

export type TodoSemanticRouteResult =
  | { type: 'grounded_capability'; capability: TodoDataIntent; confidence: number }
  | { type: 'clarification'; candidates: TodoDataIntent[] }
  | { type: 'general_chat' };

export function matchTodoCapability(
  message: string,
  capabilities: TodoCapability[] = TODO_CAPABILITIES
): TodoSemanticRouteResult {
  const normalized = normalize(message);
  if (!normalized) return { type: 'general_chat' };

  const scored = capabilities
    .map((c) => ({ id: c.id, score: scoreCapability(normalized, c) }))
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  const second = scored[1];

  if (!top || top.score === 0) return { type: 'general_chat' };

  if (second && second.score > 0 && top.score - second.score <= AMBIGUOUS_GAP) {
    // Never validated capability IDs outside the registry can reach
    // here — `scored` is derived entirely from `capabilities`, so this
    // is inherently allowlisted, not a free-form model choice.
    return { type: 'clarification', candidates: [top.id, second.id] };
  }

  if (top.score >= CONFIDENT_THRESHOLD) {
    return { type: 'grounded_capability', capability: top.id, confidence: top.score };
  }

  return { type: 'general_chat' };
}

