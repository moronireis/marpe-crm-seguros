import { useState } from 'react';
import { INTEGRATION_MATRIX, AGIA_PENDENCIAS, AUDIT_DATE, type IntegrationState } from '../../lib/corp/integration-status';

/**
 * "Aba de atenção" da integração Corp (pedido de 30/07): o que sincroniza, o que
 * não sincroniza e de quem depende — com a lista de pendências pronta para o
 * e-mail à Agger/Agia. Fonte única: lib/corp/integration-status.ts.
 */

const STATE_META: Record<IntegrationState, { label: string; color: string; bg: string }> = {
  ok:      { label: 'Sincronizando',        color: 'var(--green)',      bg: 'var(--green-dim)' },
  parcial: { label: 'Parcial',              color: 'var(--amber)',      bg: 'var(--amber-dim)' },
  nosso:   { label: 'Planejado (CRM)',      color: 'var(--accent-light)', bg: 'var(--accent-dim)' },
  agia:    { label: 'Depende da Corp/Agia', color: 'var(--red)',        bg: 'var(--red-dim)' },
};

const ORDER: IntegrationState[] = ['ok', 'parcial', 'agia', 'nosso'];

export default function CorpIntegrationReport() {
  const [filter, setFilter] = useState<IntegrationState | 'all'>('all');
  const [showPend, setShowPend] = useState(true);

  const counts = INTEGRATION_MATRIX.reduce((acc, i) => {
    acc[i.state] = (acc[i.state] || 0) + 1;
    return acc;
  }, {} as Record<IntegrationState, number>);

  const items = INTEGRATION_MATRIX
    .filter(i => filter === 'all' || i.state === filter)
    .sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state));

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid rgba(217,119,6,0.35)', borderRadius: 10, padding: 16, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span style={{ fontSize: 13, fontWeight: 700 }}>Relatório da integração Corp (Agia)</span>
        <span style={{ fontSize: 10.5, color: 'var(--text-muted)', marginLeft: 'auto' }}>auditoria {AUDIT_DATE}</span>
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 12 }}>
        A plataforma ainda <strong>não sincroniza 100%</strong> do Corp — a maior parte do que falta depende
        de rotas que a API da Agia não expõe ou que respondem erro. Abaixo: o estado de cada área e a lista
        de pendências já formalizadas para envio por e-mail.
      </p>

      {/* Filtros por estado */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        <button onClick={() => setFilter('all')}
          style={{ padding: '4px 10px', borderRadius: 999, fontSize: 10.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', background: filter === 'all' ? 'var(--accent-dim)' : 'var(--field-bg)', border: `1px solid ${filter === 'all' ? 'rgba(59,130,246,0.4)' : 'var(--hairline)'}`, color: filter === 'all' ? 'var(--accent-light)' : 'var(--text-secondary)' }}>
          Tudo ({INTEGRATION_MATRIX.length})
        </button>
        {ORDER.map(st => (
          <button key={st} onClick={() => setFilter(filter === st ? 'all' : st)}
            style={{ padding: '4px 10px', borderRadius: 999, fontSize: 10.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', background: filter === st ? STATE_META[st].bg : 'var(--field-bg)', border: `1px solid ${filter === st ? STATE_META[st].color : 'var(--hairline)'}`, color: filter === st ? STATE_META[st].color : 'var(--text-secondary)' }}>
            {STATE_META[st].label} ({counts[st] || 0})
          </button>
        ))}
      </div>

      {/* Matriz */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
        {items.map((i, idx) => (
          <div key={idx} style={{ display: 'flex', gap: 10, padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)' }}>
            <span style={{ flexShrink: 0, alignSelf: 'flex-start', fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '2px 8px', borderRadius: 999, background: STATE_META[i.state].bg, color: STATE_META[i.state].color, marginTop: 1, minWidth: 96, textAlign: 'center' }}>
              {STATE_META[i.state].label}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{i.area}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: 2 }}>{i.detail}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Pendências para a Agia */}
      <button onClick={() => setShowPend(v => !v)}
        style={{ width: '100%', textAlign: 'left', padding: '9px 12px', borderRadius: 9, background: 'var(--red-dim)', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Pendências para solicitar à Corp/Agia por e-mail ({AGIA_PENDENCIAS.length})
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{showPend ? '▾' : '▸'}</span>
      </button>
      {showPend && (
        <div style={{ marginTop: 8, padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border-subtle)', background: 'var(--bg-secondary)' }}>
          {AGIA_PENDENCIAS.map((p, i) => (
            <div key={i} style={{ fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.6, padding: '3px 0', borderBottom: i < AGIA_PENDENCIAS.length - 1 ? '1px solid rgba(255,255,255,0.03)' : 'none' }}>
              {p}
            </div>
          ))}
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
            O e-mail completo, pronto para enviar, está no documento <strong>SOLICITACAO-AGIA-API.md</strong> do
            projeto (com os exemplos técnicos de cada erro). Enquanto a Agia não responder, os itens marcados
            em vermelho acima não têm como ser sincronizados.
          </div>
        </div>
      )}
    </div>
  );
}
