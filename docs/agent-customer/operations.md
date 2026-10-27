# Operação da referência

## Configuração

O serviço só inicia com `APP_MODE=demo` explicitamente definido. Bind padrão: `127.0.0.1`. Modo de produção é recusado porque o resolver de identidade e a origem de tickets reais ainda precisam ser integrados. Não publicar o laboratório na internet.

`DATABASE_URL` seleciona PostgreSQL externo; sem essa variável, usar PGlite no diretório `DATA_DIR`. A aplicação não cria projetos externos. Migrações idempotentes da referência são aplicadas ao iniciar; usar banco dedicado de desenvolvimento. Antes de produção, extrair migrações para o fluxo de deploy e uma conta de runtime com privilégios mínimos.

## Falhas e recuperação

- Provedor falha: execução termina com código sanitizado; atendimento manual continua disponível.
- Worker interrompido: o lease expira e permite recuperação. A nova tentativa retoma o último checkpoint sem publicar duas sugestões.
- Mensagem nova: gravar uma revisão monotônica; resultados de revisões anteriores ficam obsoletos.
- Cancelamento: marca estado terminal; o worker aborta chamadas cooperativamente e a transação impede gravação posterior.
- Job preso: inspecionar metadados de `agent_runs`, sem exportar conteúdo. Não editar resultados manualmente para simular sucesso.
- Desativação: iniciar com `AGENT_ENABLED=false`; novas análises são recusadas. Cancelar execuções ativas antes de manutenção.

Não aplicar retry ilimitado: o worker limita recuperações a três claims. Orçamento de quatro chamadas ao modelo, oito ferramentas e prazo de 60 segundos a partir do primeiro claim são persistidos e compartilhados entre recuperações.

## Segurança de dados

Credenciais não aparecem nas respostas ou logs. O logger HTTP fica desligado na referência. Conteúdo do modelo não é enviado ao LangSmith automaticamente, mesmo que existam variáveis herdadas no ambiente.

A rotina de manutenção remove conteúdo de execuções e checkpoints após 30 dias e metadados após 90 dias. Revogação de conhecimento é imediata na busca por `active=false`; excluir documentos e artefatos associados quando a origem solicitar. Integrações externas, backups e exportações precisam de fluxo de exclusão próprio.

O mascaramento de e-mail/telefone/CPF é uma proteção básica; não oferece garantia completa de anonimização. Não usar dados reais antes da revisão de classificação, retenção e tratamento pelo provedor escolhido.

## Lançamento

Medir com corpus sanitizado e revisão do atendimento. Dados sintéticos e modelo determinístico validam fluxo, não qualidade semântica. O conjunto de 100 tickets reais, métricas de urgência e teste de carga do plano continuam pré-requisitos do piloto real.
