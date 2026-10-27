import { AgentSuggestionSchema, type AgentSuggestion, type Evidence, type TicketSnapshot } from './contracts.js';
import { AppError } from './errors.js';
export function validateSuggestion(raw: AgentSuggestion, evidence: Evidence[], snapshot: TicketSnapshot): AgentSuggestion {
  const value = AgentSuggestionSchema.parse(raw);
  for (const ref of value.evidenceRefs) {
    const valid = ref.kind === 'document' ? evidence.some(e => e.id === ref.id && e.documentVersion === ref.version && e.audience === 'public')
      : ref.kind === 'ticket_message' ? snapshot.messages.some(m => m.id === ref.id && m.visibility === 'public' && ref.version === String(snapshot.version))
      : snapshot.customerFacts.some(f => f.id === ref.id && f.audience === 'public' && f.sourceVersion === ref.version);
    if (!valid) throw new AppError('INVALID_EVIDENCE', 422);
  }
  if (value.disposition === 'draft' && !value.evidenceRefs.some(ref => ref.kind === 'document')) throw new AppError('MISSING_KNOWLEDGE', 422);
  return value;
}
