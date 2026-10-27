import { z } from 'zod';

const id = z.string().trim().min(1).max(200);
export const ActorSchema = z.object({ tenantId: id, actorId: id, permissions: z.array(z.string()).max(100) }).strict();
export type ActorContext = z.infer<typeof ActorSchema>;
export const MessageSchema = z.object({ id, body: z.string().max(50000), visibility: z.enum(['public', 'internal']), createdAt: z.string() }).strict();
export const FactSchema = z.object({ id, key: z.string(), value: z.string(), sourceVersion: z.string(), audience: z.enum(['public', 'internal']) }).strict();
export const TicketSchema = z.object({ id, tenantId: id, version: z.number().int().positive(), status: z.string(), subject: z.string().max(1000), messages: z.array(MessageSchema), customerFacts: z.array(FactSchema) }).strict();
export type TicketSnapshot = z.infer<typeof TicketSchema>;
export const EvidenceSchema = z.object({ id, documentId: id, documentVersion: z.string(), passageId: id, excerpt: z.string(), audience: z.enum(['public', 'internal']), updatedAt: z.string() }).strict();
export type Evidence = z.infer<typeof EvidenceSchema>;
export const TriageSchema = z.object({
  summary: z.string().min(1).max(3000), category: z.enum(['access', 'billing', 'technical', 'general', 'unknown']),
  priority: z.enum(['low', 'normal', 'high', 'urgent']), priorityReason: z.string().min(1).max(1000),
}).strict();
export type Triage = z.infer<typeof TriageSchema>;
export const DraftSchema = z.object({
  publicDraft: z.string().min(1).max(10000).nullable(),
  evidenceRefs: z.array(z.object({ kind: z.enum(['document', 'ticket_message', 'customer_fact']), id, version: z.string() }).strict()).max(30),
  missingInformation: z.array(z.string().min(1).max(1000)).max(10),
  disposition: z.enum(['draft', 'needs_information', 'handoff']), handoffReason: z.string().max(1000).nullable(),
}).strict();
export const AgentSuggestionSchema = TriageSchema.extend({ schemaVersion: z.literal(1), ...DraftSchema.shape }).strict().superRefine((value, ctx) => {
  if (value.disposition === 'draft' && (!value.publicDraft || !value.evidenceRefs.length)) ctx.addIssue({ code: 'custom', message: 'Rascunho exige texto e evidências.' });
  if (value.disposition !== 'draft' && value.publicDraft !== null) ctx.addIssue({ code: 'custom', message: 'Encaminhamento não publica rascunho.' });
  if (value.disposition === 'handoff' && !value.handoffReason) ctx.addIssue({ code: 'custom', message: 'Encaminhamento exige motivo.' });
});
export type AgentSuggestion = z.infer<typeof AgentSuggestionSchema>;
export const RunRequestSchema = z.object({ ticketId: id, ticketVersion: z.number().int().positive(), idempotencyKey: z.string().min(1).max(128) }).strict();
export type RunRequest = z.infer<typeof RunRequestSchema>;
export type RunStatus = 'queued' | 'running' | 'completed' | 'superseded' | 'failed' | 'cancelled';
export type RunView = { runId: string; ticketId: string; ticketVersion: number; status: RunStatus; suggestion: AgentSuggestion | null; errorCode: string | null };
export type RunEvent = { sequence: number; runId: string; type: 'status' | 'progress' | 'result' | 'error'; payload: Record<string, unknown> };
export type SearchQuery = { text: string; limit: number; audience: 'public' | 'internal' };
export interface TicketGateway {
  getSnapshot(ctx: ActorContext, ticketId: string): Promise<TicketSnapshot>;
  isCurrent(ctx: ActorContext, ticketId: string, version: number): Promise<boolean>;
}
export interface KnowledgeGateway { search(ctx: ActorContext, query: SearchQuery): Promise<Evidence[]> }
