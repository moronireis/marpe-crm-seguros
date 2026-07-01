import { useState, useEffect } from 'react';

interface CorpNegocio {
  codigo: number;
  codcli: number;
  cliente: string;
  status: string;
  prioridade: string;
  tipo: string;
  tipo_neg: string;
  ramo: string;
  val_premio: number;
  val_comissao: number;
  dt_proposta: string | null;
  dt_inicio: string | null;
  dt_fim: string | null;
  observacoes: string | null;
  produtor: string | null;
  seguradora: string | null;
}

interface Props {
  corpId: string | null;
  dealId: string;
}

function fmt(v: number | null | undefined) {
  if (!v && v !== 0) return '—';
  return `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  try {
    return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR');
  } catch {
    return d;
  }
}

const s = {
  section: { marginBottom: 20 } as React.CSSProperties,
  sectionTitle: { fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 10, paddingBottom: 4, borderBottom: '1px solid var(--border-subtle)' } as React.CSSProperties,
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', minHeight: 28, gap: 8 } as React.CSSProperties,
  label: { fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, minWidth: 110 } as React.CSSProperties,
  value: { fontSize: 12, color: 'var(--text-primary)', fontWeight: 500, textAlign: 'right' as const, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const } as React.CSSProperties,
  badge: (color: string) => ({
    display: 'inline-block', fontSize: 10, fontWeight: 600, padding: '2px 8px',
    borderRadius: 4, background: `${color}18`, color, border: `1px solid ${color}33`,
    textTransform: 'uppercase' as const, letterSpacing: '0.04em',
  }),
};

const STATUS_COLORS: Record<string, string> = {
  aberto: '#60A5FA',
  andamento: '#fbbf24',
  fechado: '#4ade80',
  cancelado: '#f87171',
  perdido: '#f87171',
};

export default function DealTabPerfil({ corpId, dealId }: Props) {
  const [data, setData] = useState<CorpNegocio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detalhes, setDetalhes] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    if (!corpId) {
      setLoading(false);
      return;
    }

    // Try to load Corp data via our API proxy
    fetch(`/api/corp/negocio?codigo=${corpId}`)
      .then(r => {
        if (!r.ok) throw new Error('Falha ao buscar dados do Corp');
        return r.json();
      })
      .then(d => {
        setData(d.negocio || null);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [corpId]);

  // Also load stored detalhes_corp from the deal
  useEffect(() => {
    fetch(`/api/deals/${dealId}`)
      .then(r => r.json())
      .then(d => {
        if (d.deal?.detalhes_corp) {
          setDetalhes(typeof d.deal.detalhes_corp === 'string' ? JSON.parse(d.deal.detalhes_corp) : d.deal.detalhes_corp);
        }
      })
      .catch(() => {});
  }, [dealId]);

  if (loading) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>
        Carregando dados do Corp...
      </div>
    );
  }

  if (!corpId) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>
        <div style={{ marginBottom: 8 }}>Este negocio nao esta vinculado ao Corp.</div>
        <div style={{ fontSize: 11 }}>O corp_id sera preenchido automaticamente durante a sincronizacao.</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ fontSize: 12, textAlign: 'center', padding: 24 }}>
        <div style={{ color: '#f87171', marginBottom: 8 }}>Erro ao buscar dados do Corp</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{error}</div>
        {detalhes && (
          <div style={{ marginTop: 16, textAlign: 'left' }}>
            <div style={{ ...s.sectionTitle }}>Dados Salvos (ultima sincronizacao)</div>
            {renderDetalhes(detalhes)}
          </div>
        )}
      </div>
    );
  }

  if (!data && !detalhes) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>
        Nenhum dado encontrado no Corp para o codigo {corpId}.
      </div>
    );
  }

  const neg = data;
  const statusColor = STATUS_COLORS[(neg?.status || '').toLowerCase()] || 'var(--text-muted)';

  return (
    <div>
      {neg && (
        <>
          {/* Header with Corp code */}
          <div style={{ ...s.section, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Corp #{neg.codigo}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>{neg.cliente}</div>
            </div>
            <span style={s.badge(statusColor)}>{neg.status}</span>
          </div>

          {/* Negociacao */}
          <div style={s.section}>
            <div style={s.sectionTitle}>Negociacao</div>
            <div style={s.row}><span style={s.label}>Tipo</span><span style={s.value}>{neg.tipo_neg || neg.tipo || '—'}</span></div>
            <div style={s.row}><span style={s.label}>Ramo</span><span style={s.value}>{neg.ramo || '—'}</span></div>
            <div style={s.row}><span style={s.label}>Seguradora</span><span style={s.value}>{neg.seguradora || '—'}</span></div>
            <div style={s.row}><span style={s.label}>Prioridade</span><span style={s.value}>{neg.prioridade || '—'}</span></div>
            <div style={s.row}><span style={s.label}>Produtor</span><span style={s.value}>{neg.produtor || '—'}</span></div>
          </div>

          {/* Valores */}
          <div style={s.section}>
            <div style={s.sectionTitle}>Valores</div>
            <div style={s.row}><span style={s.label}>Premio</span><span style={s.value}>{fmt(neg.val_premio)}</span></div>
            <div style={s.row}><span style={s.label}>Comissao</span><span style={s.value}>{fmt(neg.val_comissao)}</span></div>
          </div>

          {/* Datas */}
          <div style={s.section}>
            <div style={s.sectionTitle}>Datas</div>
            <div style={s.row}><span style={s.label}>Proposta</span><span style={s.value}>{fmtDate(neg.dt_proposta)}</span></div>
            <div style={s.row}><span style={s.label}>Inicio</span><span style={s.value}>{fmtDate(neg.dt_inicio)}</span></div>
            <div style={s.row}><span style={s.label}>Fim</span><span style={s.value}>{fmtDate(neg.dt_fim)}</span></div>
          </div>

          {/* Observacoes */}
          {neg.observacoes && (
            <div style={s.section}>
              <div style={s.sectionTitle}>Observacoes Corp</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-card)', borderRadius: 6, padding: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }}>
                {neg.observacoes}
              </div>
            </div>
          )}
        </>
      )}

      {/* Stored detalhes_corp (cached/enriched data) */}
      {detalhes && !neg && (
        <div style={s.section}>
          <div style={s.sectionTitle}>Dados Salvos (Corp)</div>
          {renderDetalhes(detalhes)}
        </div>
      )}

      <div style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', padding: '8px 0' }}>
        Dados via Corp Nuvem (api.corpnuvem.com)
      </div>
    </div>
  );
}

function renderDetalhes(obj: Record<string, any>) {
  const entries = Object.entries(obj).filter(([, v]) => v != null && v !== '');
  if (entries.length === 0) return <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sem detalhes.</div>;
  return (
    <div>
      {entries.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border-subtle)', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{k.replace(/_/g, ' ')}</span>
          <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(v)}</span>
        </div>
      ))}
    </div>
  );
}
