import type { Database } from '../agent-customer/adapters/database.js';
export async function seedDemo(db: Database): Promise<void> {
  const tickets = [
    { id: 'T-1001', tenantId: 'acme', version: 1, status: 'open', subject: 'Não consigo acessar minha conta',
      messages: [
        { id: 'm1', body: 'Não consigo acessar minha conta. Como recupero a senha?', visibility: 'public', createdAt: '2026-10-23T12:00:00Z' },
        { id: 'm2', body: 'INTERNAL-ONLY-739: investigação comercial em andamento.', visibility: 'internal', createdAt: '2026-10-23T12:01:00Z' },
      ], customerFacts: [{ id: 'f1', key: 'plano', value: 'Equipe', sourceVersion: '1', audience: 'public' }] },
    { id: 'T-1002', tenantId: 'acme', version: 1, status: 'open', subject: 'Configurar telemetria Zigbee',
      messages: [{ id: 'm3', body: 'Preciso configurar telemetria Zigbee para um dispositivo experimental.', visibility: 'public', createdAt: '2026-10-23T12:05:00Z' }], customerFacts: [] },
    { id: 'T-1003', tenantId: 'acme', version: 1, status: 'open', subject: 'Segunda via da fatura',
      messages: [{ id: 'm4', body: 'Como obtenho a segunda via da fatura de cobrança?', visibility: 'public', createdAt: '2026-10-23T12:06:00Z' }], customerFacts: [] },
  ];
  await db.transaction(async tx => {
    for (const ticket of tickets) await tx.query('INSERT INTO demo_tickets(tenant_id,id,version,snapshot) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [ticket.tenantId, ticket.id, ticket.version, JSON.stringify(ticket)]);
    const docs = [
      ['acme', 'access-guide', 'Recuperação de acesso e senha', 'Para recuperar acesso à conta, use a opção Esqueci minha senha na tela de acesso e siga as instruções enviadas ao e-mail cadastrado.', 'public'],
      ['acme', 'billing-guide', 'Fatura e cobrança', 'A segunda via da fatura está disponível em Financeiro > Faturas. Selecione a fatura e escolha Baixar PDF.', 'public'],
      ['acme', 'internal-guide', 'Acesso senha', 'INTERNAL-ONLY: regras comerciais confidenciais sobre acesso e senha.', 'internal'],
      ['other', 'other-guide', 'Segredo de outro cliente', 'Informação exclusiva da organização other.', 'public'],
    ];
    for (const [tenant, id, title, content, audience] of docs) await tx.query('INSERT INTO knowledge_documents(tenant_id,id,version,title,content,audience) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING', [tenant, id, '1', title, content, audience]);
  });
}
