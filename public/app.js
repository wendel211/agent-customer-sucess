const $ = id => document.getElementById(id);
let token = '', selected = null, currentRun = null, latestSuggestion = null, polling = null, selectionEpoch = 0;
const editors = new Map();
const categoryLabels = { access: 'Acesso', billing: 'Financeiro', technical: 'Técnico', general: 'Geral', unknown: 'Sem categoria' };
const priorityLabels = { low: 'Baixa', normal: 'Normal', high: 'Alta', urgent: 'Urgente' };
const errors = { UNAUTHORIZED: 'Token inválido. Confira o DEMO_TOKEN no seu .env.', TICKET_CHANGED: 'O ticket foi atualizado. Carregue a versão atual.', AGENT_DISABLED: 'O agente está desativado neste ambiente.', RATE_LIMITED: 'Limite de solicitações atingido. Tente novamente em um minuto.', INVALID_REQUEST: 'Solicitação inválida.', TIMEOUT: 'A análise atingiu o limite de tempo. O atendimento manual continua disponível.' };
async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { authorization: `Bearer ${token}`, ...(options.body ? { 'content-type': 'application/json' } : {}), ...options.headers } });
  const body = await response.json(); if (!response.ok) throw new Error(errors[body.error?.code] ?? 'Não foi possível concluir a solicitação. Tente novamente.'); return body;
}
function status(text, busy = false) { $('agent-status').textContent = text; $('agent-status').dataset.busy = String(busy); }
function toast(text) { $('toast').textContent = text; $('toast').hidden = false; setTimeout(() => $('toast').hidden = true, 4000); }
function clearResult() { latestSuggestion = null; $('suggestion').hidden = true; $('use-draft').hidden = true; }
function isActive(run) { return ['queued', 'running'].includes(run.status); }
async function selectTicket(id) {
  const epoch = ++selectionEpoch;
  if (selected) editors.set(selected.id, $('editor').value);
  polling?.abort(); currentRun = null; clearResult(); $('analyze').disabled = true;
  const ticket = await api(`/api/tickets/${encodeURIComponent(id)}`);
  if (epoch !== selectionEpoch) return;
  selected = ticket;
  document.querySelectorAll('.ticket-item').forEach(el => el.setAttribute('aria-current', String(el.dataset.id === id)));
  $('ticket-id').textContent = ticket.id; $('ticket-title').textContent = ticket.subject;
  $('ticket-meta').textContent = `Aberto · versão ${ticket.version} · ambiente de demonstração`;
  $('message-count').textContent = `${ticket.messages.length} mensagens`; $('messages').replaceChildren();
  for (const message of ticket.messages) {
    const article = document.createElement('article'); article.className = `message${message.visibility === 'internal' ? ' internal' : ''}`;
    const avatar = document.createElement('span'); avatar.className = 'message-avatar'; avatar.textContent = message.visibility === 'internal' ? 'N' : 'C'; avatar.setAttribute('aria-hidden', 'true');
    const content = document.createElement('div'), meta = document.createElement('div'); meta.className = 'message-meta';
    const author = document.createElement('strong'); author.textContent = message.visibility === 'internal' ? 'Nota interna' : 'Cliente';
    const time = document.createElement('time'); time.dateTime = message.createdAt; time.textContent = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(message.createdAt));
    const text = document.createElement('p'); text.textContent = message.body; meta.append(author, time); content.append(meta, text); article.append(avatar, content); $('messages').append(article);
  }
  $('editor').value = editors.get(id) ?? ''; $('copy').disabled = !$('editor').value.trim(); $('analyze').disabled = false; $('cancel').hidden = true; status('Pronto para analisar este ticket.');
}
function renderSuggestion(suggestion) {
  latestSuggestion = suggestion; $('suggestion').hidden = false;
  $('summary').textContent = suggestion.summary; $('category').textContent = categoryLabels[suggestion.category]; $('priority').textContent = `Prioridade ${priorityLabels[suggestion.priority].toLowerCase()}`;
  $('priority').title = suggestion.priorityReason;
  $('draft').textContent = suggestion.publicDraft ?? suggestion.handoffReason ?? 'Ainda não há informação suficiente para uma resposta fundamentada.';
  $('use-draft').hidden = !suggestion.publicDraft;
  $('sources').replaceChildren(); for (const ref of suggestion.evidenceRefs) { const li = document.createElement('li'); li.textContent = `${ref.id} · versão ${ref.version}`; $('sources').append(li); }
  if (!suggestion.evidenceRefs.length) { const li = document.createElement('li'); li.textContent = 'Nenhum procedimento aplicável encontrado.'; $('sources').append(li); }
  $('questions').replaceChildren(); for (const question of suggestion.missingInformation) { const li = document.createElement('li'); li.textContent = question; $('questions').append(li); }
  $('questions-wrap').hidden = !suggestion.missingInformation.length;
}
async function watchRun(ticketId, runId, signal) {
  while (!signal.aborted && selected?.id === ticketId) {
    const run = await api(`/api/tickets/${encodeURIComponent(ticketId)}/agent-runs/${runId}`, { signal });
    if (signal.aborted || selected?.id !== ticketId) return;
    currentRun = run; $('cancel').hidden = !isActive(run);
    if (run.status === 'completed' && run.suggestion) { renderSuggestion(run.suggestion); status('Sugestão pronta. Revise as fontes e o conteúdo.'); $('analyze').disabled = false; return; }
    if (!isActive(run)) {
      clearResult(); status(run.status === 'superseded' ? 'Esta análise ficou desatualizada. Recarregue o ticket antes de analisar novamente.' : run.status === 'cancelled' ? 'Análise cancelada. Seu rascunho foi preservado.' : errors[run.errorCode] ?? 'A análise não foi concluída. Você pode continuar o atendimento manualmente.'); $('analyze').disabled = false; return;
    }
    status(run.status === 'queued' ? 'Análise na fila…' : 'Lendo o ticket e consultando os procedimentos…', true);
    await new Promise(resolve => {
      const finish = () => { clearTimeout(timeout); signal.removeEventListener('abort', finish); resolve(); };
      const timeout = setTimeout(finish, 1500);
      if (signal.aborted) finish(); else signal.addEventListener('abort', finish, { once: true });
    });
  }
}
$('connect-form').addEventListener('submit', async event => {
  event.preventDefault(); token = $('token').value.trim(); $('connection').textContent = 'Conectando…';
  try {
    const tickets = await api('/api/tickets');
    const health = await api('/health');
    $('model-badge').textContent = health.modelKind === 'llm' ? 'Modelo de IA conectado' : 'Simulação determinística · sem LLM';
    $('tickets').replaceChildren(); $('ticket-count').textContent = String(tickets.length);
    for (const ticket of tickets) { const button = document.createElement('button'); button.className = 'ticket-item'; button.dataset.id = ticket.id;
      const id = document.createElement('small'); id.textContent = ticket.id; const title = document.createElement('strong'); title.textContent = ticket.subject; button.append(id, title);
      button.addEventListener('click', () => { void selectTicket(ticket.id).catch(error => toast(error.message)); }); $('tickets').append(button); }
    $('connection').textContent = 'Conectado'; $('connection').dataset.connected = 'true'; $('token').value = '';
    if (tickets[0]) await selectTicket(tickets[0].id);
  } catch (error) { token = ''; $('connection').textContent = 'Desconectado'; $('connection').dataset.connected = 'false'; toast(error.message); }
});
$('analyze').addEventListener('click', async () => {
  if (!selected) return; const ticketId = selected.id; $('analyze').disabled = true; clearResult(); status('Preparando análise…', true);
  polling?.abort(); polling = new AbortController(); const signal = polling.signal;
  try {
    const snapshot = await api(`/api/tickets/${encodeURIComponent(ticketId)}`, { signal });
    if (signal.aborted || selected?.id !== ticketId) return; selected = snapshot;
    const run = await api(`/api/tickets/${encodeURIComponent(ticketId)}/agent-runs`, { method: 'POST', body: JSON.stringify({ ticketVersion: snapshot.version, idempotencyKey: crypto.randomUUID() }), signal });
    await watchRun(ticketId, run.runId, signal);
  } catch (error) { if (error.name !== 'AbortError') { status(error.message); $('analyze').disabled = false; $('cancel').hidden = true; } }
});
$('cancel').addEventListener('click', async () => { if (!currentRun || !selected) return; try { await api(`/api/tickets/${encodeURIComponent(selected.id)}/agent-runs/${currentRun.runId}/cancel`, { method: 'POST' }); } catch (error) { toast(error.message); } });
$('use-draft').addEventListener('click', () => { if (latestSuggestion?.publicDraft) { $('editor').value = latestSuggestion.publicDraft; $('editor').dispatchEvent(new Event('input')); $('editor').focus(); } });
$('editor').addEventListener('input', () => { $('copy').disabled = !$('editor').value.trim(); if (selected) editors.set(selected.id, $('editor').value); });
$('copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('editor').value); toast('Rascunho copiado.'); } catch { toast('Selecione o texto no editor e copie manualmente.'); } });
