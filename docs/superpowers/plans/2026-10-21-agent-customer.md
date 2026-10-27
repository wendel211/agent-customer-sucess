# agentCustomer Implementation Plan

> **For agentic workers:** usar `superpowers:executing-plans` para executar este plano tarefa por tarefa na sessão atual. Etapas usam checkboxes para acompanhamento. Não delegar sem instrução aplicável que autorize delegação.

**Goal:** entregar um agente LangChain na seção de tickets que classifica, resume e produz sugestões fundamentadas com isolamento de acesso e execução recuperável.

**Architecture:** API autenticada registra jobs duráveis; worker executa um fluxo LangGraph com um agente LangChain de leitura. Adaptadores integram tickets e conhecimento existentes, e a interface recebe resultados persistidos e progresso sanitizado.

**Tech Stack:** referência em TypeScript, LangChain, LangGraph, Zod, PostgreSQL, Vitest e testes de interface no framework existente. pgvector e LangSmith entram conforme a arquitetura; nenhum serviço foi provisionado.

**Spec:** [2026-10-21-agent-customer-design.md](../specs/2026-10-21-agent-customer-design.md).

## Estado inicial

- [x] Inspecionar a pasta de trabalho: vazia, sem código ou Git em 21/10/2026.
- [x] Pesquisar documentação oficial atual de LangChain, LangGraph e tecnologias relacionadas.
- [x] Definir arquitetura de referência, escopo inicial e evolução.
- [x] Inicializar este plano com tarefas, interfaces e verificações.
- [ ] Executar a Tarefa 0 com o projeto real disponível.

Nenhuma tarefa de produto abaixo foi executada. Caminhos são propostos a partir da raiz da aplicação que receberá a integração. A Tarefa 0 deve adaptar os caminhos ao projeto real, sem inventar nomes de componentes existentes.

## Global Constraints

- O nome funcional do agente é `agentCustomer` e LangChain é obrigatório.
- O primeiro release opera em `copilot`; não expõe ferramentas de envio público, fechamento, reembolso ou alteração de conta.
- A autenticação fornece `tenantId`, `actorId` e permissões; nunca confiar em organização informada pelo cliente ou modelo.
- Limites iniciais: 4 chamadas ao modelo, 8 chamadas de ferramentas, 60 segundos totais e até 2 novas tentativas transitórias de leitura.
- Contexto inicial: até 6 trechos recuperados, últimas 20 mensagens acessíveis e resumo anterior versionado.
- A gravação da sugestão exige comparação atômica da revisão do ticket.
- Checkpointer persistente em PostgreSQL em produção; memória em RAM somente para testes.
- Segredos somente no servidor; conteúdo e traces sanitizados.
- Proposta de retenção: 30 dias para conteúdo/checkpoints; 90 dias para metadados operacionais sem corpos de mensagens.
- Fixar versões exatas compatíveis no lockfile ao implementar; validar APIs nos documentos dessas versões.
- Não provisionar hospedagem, criar banco externo ou enviar mensagens como efeito da preparação deste plano.

## Review Focus

1. Contexto de outra organização: negar antes de recuperar ticket, conhecimento, checkpoint ou execução; Tarefas 1, 2 e 6.
2. Mensagem nova durante a análise: resultado antigo fica `superseded`; Tarefas 2, 5 e 7.
3. Nota interna ou instrução maliciosa: não aparecer no rascunho público nem alterar permissões; Tarefas 3, 4 e 8.
4. Worker cai após gravar mas antes de confirmar job: replay não duplica execução ou resultado; Tarefas 2 e 5.
5. Falta de base ou indisponibilidade do provedor: informar estado recuperável sem inventar resposta ou bloquear atendimento; Tarefas 3, 4, 6 e 7.

## Estrutura proposta

```text
docs/agent-customer/integration-map.md
docs/agent-customer/operations.md
src/agent-customer/contracts.ts
src/agent-customer/config.ts
src/agent-customer/context.ts
src/agent-customer/policy.ts
src/agent-customer/tools.ts
src/agent-customer/agent.ts
src/agent-customer/graph.ts
src/agent-customer/validate-result.ts
src/agent-customer/model.ts
src/agent-customer/worker.ts
src/agent-customer/runs.ts
src/agent-customer/events.ts
src/agent-customer/adapters/tickets.ts
src/agent-customer/adapters/knowledge.ts
src/agent-customer/adapters/run-store.ts
src/agent-customer/adapters/checkpointer.ts
src/agent-customer/knowledge/ingest.ts
src/agent-customer/http/routes.ts
src/agent-customer/ui/presenter.ts
tests/agent-customer/*.test.ts
tests/agent-customer/integration/*.test.ts
tests/agent-customer/e2e/*.spec.ts
evals/agent-customer/{dataset.jsonl,run.ts,report.md}
```

Arquivos de migração e o componente da tela serão localizados na Tarefa 0. Não criar diretórios de migrations ou uma UI concorrente sem verificar as convenções reais. Os comandos de teste abaixo assumem Vitest; adaptar ao executor existente na Tarefa 0 e atualizar o plano.

## Tarefa 0 — Mapear a integração e fixar a stack

**Arquivos:** criar `docs/agent-customer/integration-map.md`; atualizar este plano; modificar manifesto e lockfile reais somente no início da implementação.

**Interface produzida:** mapa com caminhos reais de autenticação, tela de ticket, serviço de mensagens, revisão de ticket, banco, jobs e testes. Decisão explícita entre adaptação TypeScript e equivalente Python.

- [ ] Inspecionar o repositório real, AGENTS.md, contratos e testes. Registrar o que já existe e a operação que fornece revisão consistente.
- [ ] Identificar onde montar as rotas propostas e onde inserir a área `agentCustomer` na tela existente. Registrar caminhos exatos no mapa e na Tarefa 7.
- [ ] Se a fonte for externa, verificar capacidades de leitura, autorização, revisão e escrita condicional em sandbox. Sem escrita condicional, limitar a entrega a rascunhos associados ao snapshot e marcar obsolescência na leitura; não alegar garantia atômica inexistente.
- [ ] Selecionar versões estáveis compatíveis de `langchain`, `@langchain/core`, `@langchain/langgraph`, `@langchain/langgraph-checkpoint-postgres`, `zod`, SDK do provedor e cliente PostgreSQL; verificar exports e dependências peer. Não instalar MCP nem Deep Agents no MVP.
- [ ] Registrar scripts `typecheck`, `test`, `test:integration` e `eval:agent-customer`, aproveitando scripts existentes.
- [ ] Executar os checks atuais para obter a baseline e registrar falhas anteriores à integração.

**Aceite:** nenhum caminho de integração apresentado como real sem inspeção; dependências e bloqueios técnicos registrados. O mapeamento não está concluído nesta entrega porque o código não está presente.

## Tarefa 1 — Contratos e autorização de leitura

**Criar:** `contracts.ts`, `config.ts`, `context.ts`, `adapters/tickets.ts` em `src/agent-customer/`; `tests/agent-customer/contracts.test.ts` e `authorization.test.ts`.

**Consome:** autenticação e fonte de tickets mapeadas na Tarefa 0.

**Produz:** tipos da seção 5 da spec; `resolveActor(request): Promise<ActorContext>`; `TicketGateway`; `loadTicketContext(ctx: ActorContext, ticketId: string): Promise<TicketSnapshot>`; `AgentConfig` com limites da spec.

- [ ] Escrever testes: `rejects_body_tenant_override` rejeita campo `tenantId`; `denies_cross_tenant_ticket` não devolve nenhum dado; `rejects_invalid_suggestion` rejeita categoria fora do enum e propriedade inesperada; `loads_only_permitted_customer_facts` retorna apenas fatos permitidos.
- [ ] Executar `npm exec vitest run tests/agent-customer/contracts.test.ts tests/agent-customer/authorization.test.ts` e confirmar falha pelas funcionalidades ausentes.
- [ ] Implementar schemas Zod estritos e adaptador de leitura; derivar organização da sessão e verificar acesso ao ticket. Preservar audiência das mensagens e revisão do snapshot.
- [ ] Reexecutar os testes e `npm run typecheck`; aceitar apenas saída sem erros novos.
- [ ] Revisar diff e registrar commit da unidade quando existir repositório Git.

## Tarefa 2 — Execuções persistidas, revisão e idempotência

**Criar:** `adapters/run-store.ts`, `runs.ts`, `events.ts`; migração no caminho definido pela Tarefa 0; `tests/agent-customer/integration/run-store.test.ts`.

**Consome:** `ActorContext`, `TicketSnapshot`, `AgentSuggestion`, `RunRequest`, `RunView`, `RunRecord` da Tarefa 1.

**Produz:**

```typescript
enqueueRun(ctx: ActorContext, request: RunRequest): Promise<RunView>
getRun(ctx: ActorContext, ticketId: string, runId: string): Promise<RunView>
requestCancellation(ctx: ActorContext, ticketId: string, runId: string): Promise<RunView>
SuggestionRepository.saveIfCurrent(ctx, runId, suggestion, expectedTicketVersion)
appendEvent(runId: string, type: 'status' | 'progress' | 'result' | 'error',
  payload: Record<string, unknown>): Promise<number>
```

`enqueueRun` valida acesso e revisão, e grava execução + job atomicamente. A chave de deduplicação é `(tenantId, idempotencyKey)`; armazenar hash do pedido. Eventos e resultados sempre resolvem organização pelo registro da execução.

- [ ] Escrever testes em PostgreSQL de teste: `same_request_same_run` retorna o mesmo `runId`; `same_key_changed_payload_conflicts` gera conflito; `foreign_run_denied` não revela existência; `stale_snapshot_not_saved` retorna `superseded`; `cancel_is_idempotent` mantém `cancelled`; `event_sequence_is_monotonic` não repete sequência.
- [ ] Executar `npm run test:integration -- tests/agent-customer/integration/run-store.test.ts` e confirmar as falhas iniciais.
- [ ] Implementar tabelas adicionais, constraints, gravação condicional e controle de acesso. Manter resultado e estado terminal consistentes na mesma transação quando estiverem no mesmo banco.
- [ ] Implementar jobs com estado, tentativas, lease e renovação; o contrato de claim será definido na Tarefa 5. Não usar um booleano em memória como lock.
- [ ] Verificar migração em banco descartável, rodar os testes e registrar commit. Nunca executar o teste contra produção.

## Tarefa 3 — Recuperação de conhecimento com referências

**Criar:** `adapters/knowledge.ts`, `knowledge/ingest.ts`, `tests/agent-customer/knowledge.test.ts` e `integration/knowledge.test.ts`; migração de conhecimento apenas se necessária.

**Consome:** `ActorContext`, `Evidence`, `SearchQuery` e fonte de documentos identificada na Tarefa 0.

**Produz:** `KnowledgeGateway.search(ctx, query): Promise<Evidence[]>`; `ingestDocument(ctx: ActorContext, documentId: string): Promise<void>`; `removeDocument(ctx: ActorContext, documentId: string): Promise<void>`.

- [ ] Escrever testes: `tenant_filter_precedes_return`; `public_search_excludes_internal`; `revoked_document_not_returned`; `current_version_replaces_old_chunks`; `empty_search_is_not_evidence`; `returns_at_most_six_passages`. Usar documentos sintéticos de duas organizações.
- [ ] Executar `npm exec vitest run tests/agent-customer/knowledge.test.ts` e confirmar falhas iniciais.
- [ ] Implementar busca existente ou textual + vetorial, versionamento e ACL. Ingestão recebe conteúdo autorizado da fonte configurada, nunca URL arbitrária enviada pelo modelo.
- [ ] Implementar remoção e invalidação de cache; registrar versão do modelo de embeddings e dimensão do índice. Se usar cache, incluir organização, consulta, audiência e versão da base na chave.
- [ ] Rodar testes unitários e de integração; validar manualmente cinco consultas PT-BR com códigos de erro e termos de produto; registrar commit.

## Tarefa 4 — agentCustomer com ferramentas restritas

**Criar:** `model.ts`, `policy.ts`, `tools.ts`, `agent.ts`, `validate-result.ts`; `tests/agent-customer/agent.test.ts` e `policy.test.ts`.

**Consome:** contratos e gateways das Tarefas 1 e 3.

**Produz:**

```typescript
analyzeSnapshot(ctx: ActorContext, snapshot: TicketSnapshot,
  signal: AbortSignal): Promise<AgentSuggestion>
validateSuggestion(suggestion: AgentSuggestion, snapshot: TicketSnapshot,
  evidence: Evidence[]): AgentSuggestion
```

O módulo `model.ts` cria instâncias do provedor por configuração de servidor. Testes injetam modelo determinístico; nenhum teste unitário chama provedor real. `tools.ts` publica somente `get_ticket`, `get_customer_context`, `search_knowledge`, vinculadas ao contexto, ticket e audiência autorizados. Na invocação que redige conteúdo público, as três ferramentas retornam apenas dados públicos e não aceitam ampliação de audiência pelo modelo.

- [ ] Escrever testes: `no_public_send_tool_registered`; `invalid_reference_rejected`; `no_evidence_requests_information`; `internal_note_excluded_from_public_generation`; `public_tools_cannot_fetch_internal_content`; `internal_triage_history_not_reused_for_public_draft`; `prompt_injection_cannot_switch_tenant`; `exhausted_budget_stops_loop`; `provider_failure_returns_controlled_error`.
- [ ] Executar `npm exec vitest run tests/agent-customer/agent.test.ts tests/agent-customer/policy.test.ts` e verificar falhas iniciais.
- [ ] Implementar `analyzeSnapshot`: classificar com entrada interna autorizada, recuperar evidências públicas e gerar o rascunho em uma invocação distinta de `createAgent`, com prompt versionado e `responseFormat` compatível. Não transferir histórico, resumo interno ou checkpoint de triagem ao contexto público. Combinar os resultados somente no backend.
- [ ] Implementar contadores compartilhados da execução, prazo total com cancelamento e retries limitados a operações transitórias de leitura. Um retry não reinicia o orçamento da execução.
- [ ] Validar schema e pertencimento das referências; inconsistência vira erro controlado. Sem base suficiente, retornar `needs_information` ou `handoff` com `publicDraft: null`.
- [ ] Rodar testes e typecheck; executar um smoke test opcional somente quando credenciais de desenvolvimento estiverem configuradas; registrar commit.

## Tarefa 5 — Grafo, checkpoints e worker recuperável

**Criar:** `graph.ts`, `worker.ts`, `adapters/checkpointer.ts`; `tests/agent-customer/integration/worker.test.ts` e `graph.test.ts`.

**Consome:** `analyzeSnapshot`, `enqueueRun`, `SuggestionRepository`, `TicketGateway`, banco e configuração das tarefas anteriores.

**Produz:** `processRun(runId: string, signal: AbortSignal): Promise<void>`; `claimNextJob(workerId: string): Promise<{ runId: string; leaseToken: string } | null>`; `renewLease(leaseToken: string): Promise<boolean>`; grafo compilado e mapeamento persistente para UUID de thread.

- [ ] Escrever testes: `checkpoint_survives_restart`; `expired_lease_reclaimed`; `only_one_worker_per_ticket`; `replay_after_save_does_not_duplicate`; `new_ticket_version_supersedes`; `cancel_stops_final_write`; `sixty_second_deadline_stops_work` com relógio controlado.
- [ ] Executar `npm run test:integration -- tests/agent-customer/integration/worker.test.ts` e confirmar falhas iniciais.
- [ ] Montar o grafo persistido `load_context → analyze → validate → persist_result`, usando `analyzeSnapshot` como implementação do nó `analyze`. Triagem, recuperação e geração vivem nesse nó, sem chamadas duplicadas no wrapper. Replay de `analyze` pode repetir geração e leituras, mas não grava uma nova sugestão antes do nó final.
- [ ] Configurar checkpointer PostgreSQL, thread derivada do mapeamento autorizado e serialização por ticket. Gravar checkpoints em cada transição suportada, mantendo efeitos idempotentes.
- [ ] Implementar leasing, renovação e recuperação. Se o processo cair depois da gravação final, o job reprocessado reconhece resultado terminal e conclui sem repetir o efeito.
- [ ] Testar reinício real do worker no ambiente descartável e executar os testes; registrar commit.

## Tarefa 6 — API e eventos autenticados

**Criar:** `http/routes.ts`, `tests/agent-customer/integration/http.test.ts` e `events.test.ts`.

**Consome:** funções de runs, autorização e eventos das Tarefas 1, 2 e 5.

**Produz:** as quatro rotas da seção 9 da spec. Cada evento SSE usa sequência persistida em `id`; payload nunca inclui checkpoint bruto, prompt, raciocínio ou segredo.

- [ ] Escrever testes: `post_returns_202`; `wrong_tenant_has_no_events`; `ticket_run_mismatch_denied`; `resume_after_last_event_id`; `provider_error_is_sanitized`; `cancel_route_idempotent`; `duplicate_key_returns_existing_run`; `different_payload_returns_409`.
- [ ] Executar `npm run test:integration -- tests/agent-customer/integration/http.test.ts tests/agent-customer/integration/events.test.ts` e confirmar falhas iniciais.
- [ ] Montar handlers nas rotas existentes, limites por organização/usuário e proteção CSRF quando a autenticação usar cookies. O cliente recebe estado persistido mesmo após reinício da API.
- [ ] Adaptar event streaming interno à união de eventos sanitizados. Implementar reconexão SSE e polling como alternativa; fechar conexões sem cancelar involuntariamente o job.
- [ ] Rodar testes e typecheck; registrar commit.

## Tarefa 7 — Integrar a seção de tickets

**Criar:** `ui/presenter.ts`, `tests/agent-customer/ui.test.ts`, `tests/agent-customer/e2e/ticket-agent.spec.ts`.

**Modificar:** componente do detalhe do ticket e cliente HTTP reais identificados na Tarefa 0; caminhos precisam constar no mapa antes de iniciar esta tarefa.

**Consome:** `RunView`, rotas e eventos da Tarefa 6.

**Produz:** `toAgentPanelState(run: RunView | null): AgentPanelState`, uma união discriminada de `idle`, `loading`, `ready`, `needs_information`, `handoff`, `stale`, `error`, `cancelled`; o componente renderiza o estado e chama o cliente HTTP existente.

- [ ] Escrever testes: `stale_result_cannot_replace_current_draft`; `edited_human_draft_not_overwritten`; `empty_base_shows_questions`; `network_reconnect_preserves_run`; `agent_failure_keeps_manual_reply_available`.
- [ ] Executar o teste de UI e confirmar falhas iniciais. No projeto React, usar a biblioteca de testes já instalada; em outro framework, adaptar ao padrão existente.
- [ ] Implementar ação de analisar, progresso, resumo, rascunho editável, referências acessíveis e versão da análise. Usar tokens e componentes atuais da aplicação.
- [ ] Vincular a sugestão ao editor público apenas após ação explícita do atendente. Uma sugestão posterior não sobrescreve edição humana. O fluxo atual continua responsável pelo envio.
- [ ] Executar teste ponta a ponta: abrir ticket autorizado, analisar, ver fontes, inserir rascunho no editor, editar, receber nova mensagem e visualizar aviso de análise desatualizada.
- [ ] Conferir teclado, leitores de tela, viewport pequeno e ausência de notas internas no rascunho público; registrar commit.

## Tarefa 8 — Avaliação, operação e piloto

**Criar:** `evals/agent-customer/dataset.jsonl`, `run.ts`, `report.md`; `docs/agent-customer/operations.md`; testes de retenção e sanitização em `tests/agent-customer/integration/operations.test.ts`.

**Consome:** o fluxo integrado e as metas da seção 13 da spec.

**Produz:** `evaluateAgentCustomer(datasetPath: string): Promise<EvaluationReport>` com versão de modelo/prompt/política, tamanho de amostra, métricas e falhas; procedimento de desativação e recuperação.

- [ ] Definir casos sintéticos adversariais; reunir e sanitizar 100 casos rotulados, separar 60/40 e adicionar amostra direcionada de pelo menos 20 urgentes. Sem acesso a dados reais, marcar a avaliação como sintética e não usar isso como evidência de qualidade operacional.
- [ ] Escrever testes: `traces_redact_sensitive_fields`; `retention_removes_expired_checkpoints`; `deletion_removes_indexed_content`; `disabled_agent_rejects_new_runs`; `cross_tenant_adversarial_case_denied`.
- [ ] Executar os testes e confirmar falhas iniciais; implementar telemetria sanitizada, retenção, exclusão, quotas e chave de desativação.
- [ ] Integrar LangSmith se houver configuração apropriada; caso contrário, manter métricas locais sanitizadas e avaliação reproduzível. Registrar modelo, latência, tokens, erros, resultado e versão, sem expor conteúdo sensível.
- [ ] Executar `npm run eval:agent-customer` e publicar resultados reais no relatório; comparar critérios de categoria, urgência, fundamentação, concorrência e p95 da spec.
- [ ] Medir custo com consumo real e preços oficiais dos modelos candidatos. Escolher o modelo pelo conjunto de avaliação, não por nome ou novidade.
- [ ] Escrever runbook de falha do provedor, replay, job preso, revogação de documento, exclusão e rollback. Começar em `shadow`; mover para `copilot` somente após critérios medidos.
- [ ] Rodar a suíte pertinente e registrar commit final do MVP.

## Verificação de cobertura do plano

| Requisito da spec | Tarefas |
| --- | --- |
| LangChain, contrato e ferramentas | 1, 4 |
| Tickets, revisão e isolamento | 0, 1, 2, 5, 6 |
| RAG, ACL, fontes e revogação | 3, 4, 8 |
| Grafo, checkpoints e recuperação | 2, 5 |
| Interface e progresso | 6, 7 |
| Orçamento, cancelamento e falhas | 4, 5, 6, 8 |
| Privacidade, retenção e operação | 3, 4, 8 |
| Benchmark e rollout | 8 |
| Envio autônomo e revisão persistente | Evolução separada; fora do MVP |

## Backlog posterior ao MVP

- `bounded_auto`: plano próprio para ações idempotentes, revisão persistida, revalidação e reconciliação com o provedor de tickets.
- MCP: conectar apenas serviços definidos, com allowlist e autorização independente do modelo.
- Multimodalidade: extrair informações de imagens/anexos com tipos permitidos, limites de tamanho e proteção de dados.
- Roteamento e agentic RAG: experimentar redução de custo e recuperação iterativa contra o benchmark.
- Deep Agents ou especialistas: adotar somente se houver ganho verificável em casos que o agente único não resolve.

O próximo passo operacional é a Tarefa 0. O plano foi inicializado sem instalar bibliotecas ou criar uma aplicação desconectada da seção de tickets real.
