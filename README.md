# agent-customer-sucess

Copiloto de tickets com **LangChain + LangGraph**, API autenticada e execuções persistidas em PostgreSQL. O primeiro modo de operação é de sugestões: o serviço não envia respostas, fecha tickets ou modifica contas de clientes.

## Executar localmente

Requisito: Node.js 22.20 ou superior.

```powershell
npm.cmd ci
Copy-Item .env.example .env
npm.cmd run dev
```

Abra [o laboratório local](http://127.0.0.1:3000). Use o token configurado em `DEMO_TOKEN` no arquivo `.env` para conectar. Dados e checkpoints ficam em `.data/agent-customer`; não são enviados a uma LLM no modo `MODEL_MODE=demo`.

O laboratório usa tickets sintéticos. O modelo de demonstração é determinístico e roda pelo mesmo fluxo LangChain/LangGraph, mas **não é um modelo de IA** e não demonstra qualidade de atendimento real.

## Usar uma LLM

No `.env`, altere `MODEL_MODE=llm` e preencha `OPENAI_API_KEY` e `AGENT_MODEL` com credencial e identificador de modelo que suportem ferramentas/saída estruturada. A chave permanece no backend. A biblioteca usada é `@langchain/openai`; o modelo não é fixado no código.

Esse modo pode gerar cobrança pelo provedor. As entradas são minimizadas e passam por mascaramento básico de dados; isso não substitui classificação e política de dados da sua organização. LangSmith fica desligado nesta referência para impedir exportação involuntária do conteúdo. Ativação de observabilidade externa exige integração sanitizada específica.

## API

Enviar `Authorization: Bearer <token>` nas rotas de aplicação. A organização é resolvida pelo servidor e não é aceita no corpo da requisição.

| Método | Rota | Uso |
| --- | --- | --- |
| GET | `/health` | Disponibilidade, sem dados sensíveis |
| GET | `/api/tickets` | Tickets sintéticos autorizados no laboratório |
| GET | `/api/tickets/:ticketId` | Snapshot autorizado |
| POST | `/api/tickets/:ticketId/agent-runs` | Solicitar análise |
| GET | `/api/tickets/:ticketId/agent-runs/:runId` | Consultar execução e resultado |
| GET | `/api/tickets/:ticketId/agent-runs/:runId/events` | SSE com retomada por Last-Event-ID |
| POST | `/api/tickets/:ticketId/agent-runs/:runId/cancel` | Cancelar análise |

Exemplo de corpo para solicitar análise:

```json
{ "ticketVersion": 1, "idempotencyKey": "uma-chave-nova-por-analise" }
```

Repetir a chave com o mesmo corpo reutiliza a execução. A mesma chave com conteúdo diferente retorna conflito. Novas mensagens invalidam a revisão anterior. Resultados antigos recebem `superseded`.

## Verificar

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
npm.cmd run eval:agent-customer
```

Os testes de integração usam PostgreSQL embarcado PGlite, sem Docker e sem serviços externos. Eles não comprovam configuração de rede, TLS, pooling ou carga de um PostgreSQL externo. O relatório de avaliação identifica explicitamente dados sintéticos e modo de modelo.

## Arquitetura e integração

`src/agent-customer` contém contratos, gateways, persistência, agente e worker. `src/demo` contém somente os dados e o modelo sintéticos. `public/` é um laboratório de integração, não um novo sistema de tickets.

O worker usa jobs com lease, serialização por ticket, orçamento de chamadas, cancelamento e checkpoints. A geração pública recebe apenas dados classificados como públicos. Tratar mensagens/documentos como dados não confiáveis; o modelo não controla identidade, permissões ou o ticket da execução.

Para conectar o produto real, implementar os gateways de tickets/conhecimento e substituir o resolver de identidade. A gravação condicional de sugestão precisa acompanhar a revisão da fonte real; não basta trocar a leitura. Ver [mapa de integração](docs/agent-customer/integration-map.md), [operação](docs/agent-customer/operations.md), [arquitetura](docs/superpowers/specs/2026-10-21-agent-customer-design.md) e [plano](docs/superpowers/plans/2026-10-21-agent-customer.md).

Busca semântica, anexos multimodais, MCP, envio autônomo e validação com tickets reais pertencem às próximas entregas. A baseline usa busca textual de documentos aprovados.
