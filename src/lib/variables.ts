/**
 * Variable interpolation engine for WhatsApp message templates.
 *
 * Supported variables:
 *   Contact:  {{nome}}, {{primeiro_nome}}, {{telefone}}, {{email}}, {{cidade}},
 *             {{cpf_cnpj}}, {{endereco}}, {{estado}}, {{vencimento_cnh}},
 *             {{nome_negocio}}
 *   Deal:     {{veiculo}}, {{placa}}, {{apolice}}, {{seguradora}}, {{premio}},
 *             {{comissao}}, {{ramo}}, {{produtor}}, {{vigencia_inicio}},
 *             {{vigencia_fim}}, {{proxima_acao}}, {{codigo_negocio}},
 *             {{tipo_negocio}}
 *   Computed: {{periodo_dia}}
 *
 * Revisão 28/07 (PDF Campanha/Templates: "remapear tipos de variáveis de acordo
 * com os campos disponíveis no CRM/integração com o Corp") — entraram os campos
 * novos do cadastro (cpf_cnpj, endereço, CNH, nome do negócio) e do Corp
 * (código da negociação, tipo).
 *
 * Missing values are replaced with an em dash (—) so the message never exposes
 * raw placeholder tokens to the recipient.
 */

export interface InterpolationContext {
  contact?: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    city?: string | null;
    cpf_cnpj?: string | null;
    address?: string | null;
    state?: string | null;
    cnh_vencimento?: string | null;
    nome_negocio?: string | null;
  };
  deal?: {
    veiculo?: string | null;
    placa?: string | null;
    apolice?: string | null;
    seguradora?: string | null;
    premio?: number | string | null;
    iof?: number | string | null;
    premio_final?: number | string | null;
    forma_pagamento?: string | null;
    parcelas?: number | string | null;
    comissao_valor?: number | string | null;
    ramo?: string | null;
    produtor?: string | null;
    vigencia_inicio?: string | null;
    vigencia_fim?: string | null;
    next_action?: string | null;
    corp_id?: string | null;
    tipo_negocio?: string | null;
    // Sinistros (S4.2, issue #18): campos vindos do sync de sinistros do Corp
    detalhes_corp?: {
      numsin?: string | null;
      situacao?: string | null;
      franquia?: number | string | null;
      oficina?: string | null;
      datoco?: string | null;
    } | null;
  };
}

// ── Formatters ──────────────────────────────────────────────────────────────

/** Format a numeric value as Brazilian currency: R$ 1.234,56 */
function formatBRL(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(n)) return String(value);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Format an ISO date string (YYYY-MM-DD or ISO-8601) as DD/MM/YYYY */
function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  // Accept YYYY-MM-DD or full ISO timestamp
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

/** Return the Brazilian time-of-day greeting based on current local hour */
function periodoDia(): string {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return 'Bom dia';
  if (hour >= 12 && hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

// ── Core interpolator ────────────────────────────────────────────────────────

/**
 * Replace all known `{{variable}}` tokens in `template` using the provided
 * context. Token matching is case-insensitive. Unknown tokens are left as-is.
 */
export function interpolateVariables(
  template: string,
  context: InterpolationContext = {},
): string {
  const { contact, deal } = context;

  const FALLBACK = '—';
  const str = (v: string | null | undefined) => (v ?? FALLBACK) || FALLBACK;

  const vars: Record<string, string> = {
    // ── Contact ────────────────────────────────────────────────────────────
    nome: str(contact?.name),
    primeiro_nome: contact?.name
      ? (contact.name.trim().split(/\s+/)[0] ?? FALLBACK)
      : FALLBACK,
    telefone: str(contact?.phone),
    email: str(contact?.email),
    cidade: str(contact?.city),
    cpf_cnpj: str(contact?.cpf_cnpj),
    endereco: str(contact?.address),
    estado: str(contact?.state),
    vencimento_cnh: formatDate(contact?.cnh_vencimento),
    nome_negocio: str(contact?.nome_negocio),

    // ── Deal ───────────────────────────────────────────────────────────────
    veiculo: str(deal?.veiculo),
    placa: str(deal?.placa),
    apolice: str(deal?.apolice),
    seguradora: str(deal?.seguradora),
    // Teste B4 (01/08): "Prêmio FINAL é o que interessa para o cliente" — e é o cliente
    // que lê a mensagem. {{premio}} passa a ser o final (líquido + IOF); sem IOF
    // preenchido os dois são o mesmo número, então nenhum template muda hoje.
    premio: formatBRL(deal?.premio_final ?? deal?.premio),
    premio_liquido: formatBRL(deal?.premio),
    iof: formatBRL(deal?.iof),
    forma_pagamento: str(deal?.forma_pagamento),
    parcelas: deal?.parcelas ? `${deal.parcelas}x` : '',
    comissao: formatBRL(deal?.comissao_valor),
    ramo: str(deal?.ramo),
    produtor: str(deal?.produtor),
    vigencia_inicio: formatDate(deal?.vigencia_inicio),
    vigencia_fim: formatDate(deal?.vigencia_fim),
    proxima_acao: str(deal?.next_action),
    // corp_id vem como neg_1_7512 — a variável entrega só o código que o Corp mostra
    codigo_negocio: deal?.corp_id
      ? (String(deal.corp_id).match(/(\d+)$/)?.[1] ?? FALLBACK)
      : FALLBACK,
    tipo_negocio: str(deal?.tipo_negocio),

    // ── Sinistro (S4.2, issue #18) ─────────────────────────────────────────
    numero_sinistro: str(deal?.detalhes_corp?.numsin as string | null),
    situacao_sinistro: str(deal?.detalhes_corp?.situacao as string | null),
    franquia: formatBRL(deal?.detalhes_corp?.franquia),
    oficina: str(deal?.detalhes_corp?.oficina as string | null),
    data_ocorrencia: deal?.detalhes_corp?.datoco
      ? String(deal.detalhes_corp.datoco)
      : '—',

    // ── Computed ───────────────────────────────────────────────────────────
    periodo_dia: periodoDia(),
  };

  return template.replace(/\{\{(\w+)\}\}/gi, (match, token: string) => {
    const key = token.toLowerCase();
    return key in vars ? vars[key] : match;
  });
}
