import { useState, useEffect, useMemo } from 'react';

/**
 * Módulo Cadastros (R6 — report 29/07 [d7868cff]): a consulta dos cadastros do
 * Corp sai de Configurações e vira módulo do menu, com busca por lista.
 *
 * IMPORTANTE — por que é só consulta: a API do Corp NÃO tem rotas de criação/
 * edição/exclusão para seguradoras, ramos, produtores e agentes (auditado no
 * probe S0 e reconfirmado em 30/07; pedido formalizado à Agia — item 12 do
 * SOLICITACAO-AGIA-API.md). Cadastrar "só no CRM" quebraria o requisito do
 * próprio chamado ("tudo sincronizado com o Corp") e criaria divergência.
 * Assim que a Agia expuser as rotas, o CRUD entra aqui.
 */

interface LookupRow { a: string; b?: string }
interface Grupo { key: string; label: string; count: number; rows: LookupRow[] }

export default function CadastrosView() {
  const [lookups, setLookups] = useState<any>(null);
  const [stale, setStale] = useState(false);
  const [open, setOpen] = useState<string>('seguradoras');
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/corp/lookups')
      .then(r => r.json())
      .then(d => { setLookups(d); setStale(!!d.stale); })
      .catch(() => {});
  }, []);

  const grupos: Grupo[] = useMemo(() => {
    if (!lookups) return [];
    const mk = (key: string, label: string, list: any[], map: (x: any) => LookupRow): Grupo =>
      ({ key, label, count: (list || []).length, rows: (list || []).map(map) });
    return [
      mk('seguradoras', 'Seguradoras', lookups.seguradoras, (x) => ({ a: `${x.codigo} — ${x.nome}`, b: x.abreviatura })),
      mk('ramos', 'Ramos', lookups.ramos, (x) => ({ a: `${x.codigo} — ${x.nome}`, b: x.abreviatura })),
      mk('produtores', 'Produtores', lookups.produtores, (x) => ({ a: `${x.codigo} — ${x.nome}` })),
      mk('agentes', 'Agentes', lookups.agentes, (x) => ({ a: `${x.codigo} — ${x.nome}` })),
      mk('profissoes', 'Profissões', lookups.profissoes, (x) => ({ a: `${x.codigo} — ${x.profissao}` })),
      mk('estado_civil', 'Estados civis', lookups.estados_civis, (x) => ({ a: `${x.codigo} — ${x.descricao}` })),
      mk('escolaridade', 'Escolaridades', lookups.escolaridades, (x) => ({ a: `${x.codigo} — ${x.descricao}` })),
    ];
  }, [lookups]);

  const q = search.trim().toLowerCase();
  const visible = (g: Grupo) => (q ? g.rows.filter(r => (r.a + ' ' + (r.b || '')).toLowerCase().includes(q)) : g.rows);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ height: 56, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 24px', gap: 14, flexShrink: 0 }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>Cadastros</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>consulta dos cadastros do Corp — leitura, direto da API</span>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar em todos os cadastros…"
          style={{ marginLeft: 'auto', width: 260, maxWidth: '40vw', padding: '7px 13px', background: 'var(--field-bg)', border: '1px solid var(--hairline)', borderRadius: 999, color: 'var(--text-primary)', fontSize: 12.5, outline: 'none', fontFamily: 'inherit' }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        <div style={{ maxWidth: 720 }}>
          {/* Atenção: escrita bloqueada pela API */}
          <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--amber-dim)', border: '1px solid rgba(217,119,6,0.3)', fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: 16 }}>
            <strong style={{ color: 'var(--amber)' }}>Por enquanto, consulta.</strong>{' '}
            A API do Corp não tem rotas para criar, editar ou excluir estes cadastros — o CRUD sincronizado
            já foi solicitado à Agia (item 12 das pendências). O estado completo da integração está em{' '}
            <a href="/config" style={{ color: 'var(--accent-light)' }}>Configurações → Corp → Relatório da integração</a>.
          </div>

          {stale && (
            <div style={{ padding: '8px 12px', borderRadius: 9, background: 'var(--field-bg)', border: '1px solid var(--hairline)', fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
              Corp indisponível agora — mostrando a última leitura salva.
            </div>
          )}

          {!lookups ? (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Carregando cadastros do Corp…</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {grupos.map(g => {
                const rows = visible(g);
                const isOpen = q ? rows.length > 0 : open === g.key;
                if (q && rows.length === 0) return null;
                return (
                  <div key={g.key} style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-card)' }}>
                    <button onClick={() => setOpen(open === g.key ? '' : g.key)}
                      style={{ width: '100%', textAlign: 'left', padding: '12px 16px', background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 10 }}>
                      {g.label}
                      <span style={{ fontSize: 10, fontWeight: 600, background: 'var(--field-bg)', border: '1px solid var(--hairline)', color: 'var(--text-muted)', borderRadius: 999, padding: '1px 8px' }}>
                        {q ? `${rows.length}/${g.count}` : g.count}
                      </span>
                      <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 12 }}>{isOpen ? '▾' : '▸'}</span>
                    </button>
                    {isOpen && (
                      <div style={{ maxHeight: 320, overflowY: 'auto', borderTop: '1px solid var(--border-subtle)' }}>
                        {rows.map((r, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 16px', fontSize: 12.5, color: 'var(--text-secondary)', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                            <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.a}</span>
                            {r.b && <span style={{ color: 'var(--text-muted)', flexShrink: 0, fontFamily: 'monospace', fontSize: 11 }}>{r.b}</span>}
                          </div>
                        ))}
                        {rows.length === 0 && <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-muted)' }}>Nada retornado pelo Corp.</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
