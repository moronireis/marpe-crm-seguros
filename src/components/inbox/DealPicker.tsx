import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/**
 * Modal "Selecione o negócio" — chamado 3a4d910f (PDF do Marcel, 01/08).
 *
 * O PDF define que a conversa precisa ficar salva no negócio certo:
 *   1.2 "ao iniciar uma conversa o sistema deverá pedir para que o usuário
 *        selecione sobre qual negócio é o assunto"
 *   1.3 "se na mesma conversa o cliente deseja tratar de mais de um negócio, o
 *        sistema deve permitir que o usuário transfira ou indique o novo negócio"
 *
 * Vai por createPortal no body: o painel do Inbox usa backdrop-filter, e elemento
 * com backdrop-filter vira containing block — position:fixed dentro dele é clipado
 * (gotcha do redesign Liquid Glass, 10/07).
 */

export interface DealResumo {
  id: string;
  title: string;
  ramo: string | null;
  seguradora: string | null;
  apolice: string | null;
  premio: number | null;
  corp_id: string | null;
  do_contato?: boolean;
  marpe_contacts: { id: string; name: string; cpf_cnpj: string | null } | null;
  marpe_funnel_stages: { id: string; name: string; color: string } | null;
}

interface Props {
  contactId: string;
  contactName: string;
  /** Negócio já vinculado — aparece marcado na lista */
  atualId?: string | null;
  onEscolher: (deal: DealResumo | null) => void;
  onFechar: () => void;
}

export default function DealPicker({ contactId, contactName, atualId, onEscolher, onFechar }: Props) {
  const [busca, setBusca] = useState('');
  const [deals, setDeals] = useState<DealResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setCarregando(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const q = busca.trim() ? `&q=${encodeURIComponent(busca.trim())}` : '';
      fetch(`/api/deals/search?contact_id=${contactId}${q}`)
        .then(r => r.json())
        .then(d => { setDeals(d.deals || []); setCarregando(false); })
        .catch(() => setCarregando(false));
    }, busca.trim() ? 280 : 0);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [busca, contactId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onFechar]);

  const doContato = deals.filter(d => d.do_contato);
  const demais = deals.filter(d => !d.do_contato);

  const linha = (d: DealResumo) => (
    <button key={d.id} onClick={() => onEscolher(d)}
      style={{
        width: '100%', textAlign: 'left', padding: '10px 14px', cursor: 'pointer',
        background: d.id === atualId ? 'var(--accent-dim)' : 'transparent',
        border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)',
        color: 'var(--text-primary)', fontFamily: 'inherit', display: 'block',
      }}
      onMouseEnter={e => { if (d.id !== atualId) e.currentTarget.style.background = 'var(--field-bg)'; }}
      onMouseLeave={e => { if (d.id !== atualId) e.currentTarget.style.background = 'transparent'; }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {d.title}
        </span>
        {d.ramo && (
          <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 100, textTransform: 'uppercase', background: 'var(--field-bg)', color: 'var(--text-muted)', flexShrink: 0 }}>
            {d.ramo}
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {d.marpe_contacts?.name && <span>{d.marpe_contacts.name}</span>}
        {d.marpe_funnel_stages?.name && <span>· {d.marpe_funnel_stages.name}</span>}
        {d.seguradora && <span>· {d.seguradora}</span>}
        {d.apolice && <span>· apólice {d.apolice}</span>}
      </div>
    </button>
  );

  const corpo = (
    <div className="overlay-glass" onMouseDown={e => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="glass-modal modal-pop" style={{ width: 'min(560px, 92vw)', maxHeight: '80vh', borderRadius: 16, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid var(--hairline)' }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 3 }}>Selecione o negócio</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
            A conversa com <strong style={{ color: 'var(--text-secondary)' }}>{contactName}</strong> fica salva no negócio escolhido.
          </div>
          <input value={busca} onChange={e => setBusca(e.target.value)} autoFocus
            placeholder="Nome do negócio, contato, CPF/CNPJ, placa, apólice ou código do Corp"
            style={{ width: '100%', marginTop: 12, padding: '9px 14px', background: 'var(--field-bg)', border: '1px solid var(--hairline)', borderRadius: 999, color: 'var(--text-primary)', fontSize: 12.5, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {carregando && <div style={{ padding: 18, fontSize: 12.5, color: 'var(--text-muted)' }}>Buscando…</div>}

          {!carregando && doContato.length > 0 && (
            <>
              <div style={{ padding: '9px 14px 6px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Negócios deste contato
              </div>
              {doContato.map(linha)}
            </>
          )}

          {!carregando && demais.length > 0 && (
            <>
              <div style={{ padding: '9px 14px 6px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                Outros resultados
              </div>
              {demais.map(linha)}
            </>
          )}

          {!carregando && deals.length === 0 && (
            <div style={{ padding: 18, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              {busca.trim()
                ? 'Nenhum negócio encontrado para essa busca.'
                : 'Este contato ainda não tem negócio no CRM. Busque por outro negócio acima ou crie um no funil.'}
            </div>
          )}
        </div>

        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--hairline)', display: 'flex', gap: 8, alignItems: 'center' }}>
          {atualId && (
            <button onClick={() => onEscolher(null)}
              style={{ padding: '7px 13px', borderRadius: 9, border: '1px solid var(--hairline)', background: 'var(--field-bg)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
              Desvincular
            </button>
          )}
          <button onClick={onFechar}
            style={{ marginLeft: 'auto', padding: '7px 15px', borderRadius: 9, border: '1px solid var(--hairline)', background: 'var(--field-bg)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
            Agora não
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(corpo, document.body);
}
