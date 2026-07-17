/**
 * Variable interpolation engine for WhatsApp message templates.
 *
 * Supported variables:
 *   Contact:  {{nome}}, {{primeiro_nome}}, {{telefone}}, {{email}}, {{cidade}}
 *   Deal:     {{veiculo}}, {{placa}}, {{apolice}}, {{seguradora}}, {{premio}},
 *             {{comissao}}, {{ramo}}, {{produtor}}, {{vigencia_inicio}},
 *             {{vigencia_fim}}, {{proxima_acao}}
 *   Computed: {{periodo_dia}}
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
  };
  deal?: {
    veiculo?: string | null;
    placa?: string | null;
    apolice?: string | null;
    seguradora?: string | null;
    premio?: number | string | null;
    comissao_valor?: number | string | null;
    ramo?: string | null;
    produtor?: string | null;
    vigencia_inicio?: string | null;
    vigencia_fim?: string | null;
    next_action?: string | null;
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

    // ── Deal ───────────────────────────────────────────────────────────────
    veiculo: str(deal?.veiculo),
    placa: str(deal?.placa),
    apolice: str(deal?.apolice),
    seguradora: str(deal?.seguradora),
    premio: formatBRL(deal?.premio),
    comissao: formatBRL(deal?.comissao_valor),
    ramo: str(deal?.ramo),
    produtor: str(deal?.produtor),
    vigencia_inicio: formatDate(deal?.vigencia_inicio),
    vigencia_fim: formatDate(deal?.vigencia_fim),
    proxima_acao: str(deal?.next_action),

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
