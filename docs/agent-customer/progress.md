# Execução do plano agentCustomer — 23/10/2026

Plano: docs/superpowers/plans/2026-10-21-agent-customer.md

Ruling: a pasta contém somente o plano e a especificação, sem aplicação ou Git. Construir o serviço de referência nesta pasta com adaptadores explícitos e fixtures sintéticas; a integração com tickets/autenticação reais permanece pendente. Custo: será necessário implementar o adaptador do sistema real.

Ruling: executar na pasta dedicada existente, sem worktree ou commits porque não há repositório Git. Manter este registro de progresso.

Ruling: usar PostgreSQL embarcado PGlite para desenvolvimento e testes sem serviços externos; manter adaptador PostgreSQL via pg para implantação. Não considerar o ambiente local uma validação de infraestrutura de produção.

Pre-flight: contratos → gateway/contexto → repositório de execuções → agente → grafo/worker → API. Contexto e revisão precisam ser verificados na gravação e leitura. Separar estritamente invocações internas e públicas.

## Primeira versão — 26/10/2026

- Implementados contratos estritos, autorização, busca textual com audiência e escopo de organização.
- Implementados LangChain com saída estruturada, triagem e geração pública separadas, ferramentas de leitura e orçamento persistido.
- Implementados grafo LangGraph, checkpoints SQL, fila com leases, deduplicação, cancelamento e verificação de revisão na gravação e nas respostas da API.
- Implementados API autenticada, SSE e laboratório local com três tickets sintéticos e editor que preserva alterações humanas.
- Dependências fixadas no manifesto/lockfile; `.env`, banco local, cache e builds ficam fora do Git.
- Revisão independente: nenhum outro achado crítico/importante em autorização ou replay; achados sobre limite de leitura e cancelamento com resultado antigo corrigidos com regressões RED→GREEN.
- Fluxo conferido no navegador: conectar, analisar, ver fontes, editar, reanalisar sem sobrescrever texto e tratar ausência de procedimento aprovado.
- Verificações: suíte automatizada, checagem de tipos, build, dois testes do artefato compilado e avaliação sintética. Evidências consolidadas em `docs/agent-customer/v1-validation.md`.

Ruling: o laboratório usa uma thread de checkpoint por execução, com snapshot autorizado do ticket, para não reutilizar histórico interno na geração pública. Não há memória de preferências entre tickets nesta versão.

Ruling: a busca de referência é lexical PostgreSQL; busca vetorial e corpus real continuam pendentes. O modelo padrão é determinístico e explicitamente identificado como simulação; a conexão com uma LLM requer configuração do provedor.

Git inicializado na branch `main` por solicitação do usuário em 26/10/2026. Publicação em `wendel211/agent-customer-sucess` com commits por responsabilidade, usando a identidade Git configurada e sem trailers de coautoria.
