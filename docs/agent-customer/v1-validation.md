# Validação da primeira versão — 26/10/2026

Escopo: serviço local de referência, dados sintéticos, LangChain/LangGraph reais e modelo determinístico de demonstração. O serviço não envia mensagens nem altera contas de clientes.

## Verificações reproduzíveis

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run test:built
npm.cmd run eval:agent-customer
```

A suíte cobre isolamento por organização, schemas, referências, ausência de conhecimento, separação de contexto público, budgets, deduplicação, leases, replay, cancelamento, revisão desatualizada, checkpoints, rotas autenticadas e retomada SSE. O teste de leitura acompanha 80 consultas sem bloquear o acompanhamento por rate limit.

Resultado final: 43 testes Vitest aprovados em 7 arquivos; checagem TypeScript e build aprovados; 2 testes do artefato compilado aprovados; 3/3 casos sintéticos aprovados. Esses números descrevem a execução local desta versão, não uma garantia de produção.

Regressões verificadas: o prazo persistido impede gravar resultado tardio; a recuperação não reinicia o orçamento de chamadas; cancelar ou repetir pedido de uma execução antiga não devolve seu rascunho como atual.

## Verificação no navegador

1. Abrir `http://127.0.0.1:3000` e conectar com a credencial local de demonstração.
2. Analisar `T-1001`: categoria Acesso, prioridade normal, rascunho baseado em `access-guide:1`.
3. Inserir sugestão no editor, escrever uma resposta manual e analisar novamente: edição preservada.
4. Analisar `T-1002`: nenhum procedimento aplicável, texto público ausente e solicitação de mais informações.

O cenário com nota interna foi executado: a nota aparece no histórico do atendente e não aparece no rascunho público.

## Limites desta validação

Não foram usados chave de LLM, tickets reais, banco PostgreSQL externo ou tráfego de produção. Os três casos de avaliação são sintéticos, não uma medição de qualidade semântica de IA. Autenticação e adaptadores do sistema real precisam ser integrados antes de produção. Busca vetorial, multimodalidade e envio autônomo ficam fora desta versão.
