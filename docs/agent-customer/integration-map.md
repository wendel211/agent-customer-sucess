# Mapa de integração — 23/10/2026

Não há repositório da aplicação de tickets neste workspace. Esta implementação entrega o serviço de referência e um laboratório local com dados sintéticos; não substitui o sistema de tickets.

| Fronteira | Implementação local | Integração real |
| --- | --- | --- |
| Identidade | Tokens opacos mapeados no servidor | Substituir resolver pelo middleware autenticado existente |
| Tickets | `SqlTicketGateway`, tabela `demo_tickets` | Implementar `TicketGateway` para a API real |
| Revisão | Inteiro monotônico no PostgreSQL | Exigir revisão/ETag consistente da origem |
| Conhecimento | Documentos sintéticos com busca textual | Conectar artigos aprovados e ACL reais |
| Execuções/jobs | `RunStore` com transações, leases e deduplicação | PostgreSQL via `DATABASE_URL` |
| Checkpoints | `SqlCheckpointSaver` persistido no mesmo banco | Mesmo adaptador SQL |
| LLM | Modelo determinístico claramente identificado como demo | LangChain `ChatOpenAI` com modelo e credencial configurados |
| Interface | Laboratório local em `public/` | Montar área equivalente na seção de tickets existente |

Ruling: usar busca lexical PostgreSQL como baseline executável sem embeddings. Busca vetorial depende da escolha de provedor e corpus reais; não alegar busca híbrida implementada.

Limite da referência: a comparação atômica usa a tabela local de tickets. Ao conectar uma origem externa, fornecer uma operação condicional equivalente ou tratar as sugestões como snapshots e indicar obsolescência; não trocar apenas a leitura e manter a falsa garantia de atomicidade.

Runtime disponível: Node 22.20.0 e npm 11.7.0. Não havia suíte de testes anterior.
