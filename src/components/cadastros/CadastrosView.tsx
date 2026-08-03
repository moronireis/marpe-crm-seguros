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

          {/* Teste A8 (Marcel, 01/08): "onde criar, editar e consultar as etiquetas??"
              As etiquetas são nossas — por isso, ao contrário dos cadastros do Corp
              acima, esta seção tem criação, edição e exclusão de verdade. */}
          <EtiquetasPainel />

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

// ── Etiquetas (teste A8) ─────────────────────────────────────────────────────

interface Etiqueta { id: string; nome: string; cor: string | null; descricao: string | null; contatos: number }

const BTN: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 8, border: '1px solid var(--hairline)',
  background: 'var(--field-bg)', color: 'var(--text-secondary)', fontSize: 11.5,
  cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
};
const CAMPO: React.CSSProperties = {
  padding: '7px 12px', background: 'var(--field-bg)', border: '1px solid var(--hairline)',
  borderRadius: 8, color: 'var(--text-primary)', fontSize: 12.5, outline: 'none',
  fontFamily: 'inherit', boxSizing: 'border-box',
};

function EtiquetasPainel() {
  const [tags, setTags] = useState<Etiqueta[]>([]);
  const [orfas, setOrfas] = useState<{ nome: string; contatos: number }[]>([]);
  const [aberto, setAberto] = useState(true);
  const [nova, setNova] = useState('');
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function carregar() {
    try {
      const d = await (await fetch('/api/tags')).json();
      setTags(d.tags || []);
      setOrfas(d.orfas || []);
    } catch { /* silencioso — a seção some sozinha se a rota falhar */ }
  }
  useEffect(() => { carregar(); }, []);

  async function criar(nome: string) {
    if (!nome.trim()) return;
    setOcupado(true); setErro('');
    const r = await fetch('/api/tags', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: nome.trim() }),
    });
    const d = await r.json().catch(() => ({}));
    setOcupado(false);
    if (!r.ok) { setErro(d.error || 'Não foi possível criar a etiqueta.'); return; }
    setNova(''); carregar();
  }

  async function renomear(id: string) {
    if (!rascunho.trim()) return;
    setOcupado(true); setErro('');
    const r = await fetch(`/api/tags/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: rascunho.trim() }),
    });
    const d = await r.json().catch(() => ({}));
    setOcupado(false);
    if (!r.ok) { setErro(d.error || 'Não foi possível renomear.'); return; }
    setEditando(null); carregar();
  }

  async function excluir(t: Etiqueta) {
    const aviso = t.contatos > 0
      ? `Excluir "${t.nome}"? Ela será removida de ${t.contatos} contato(s).`
      : `Excluir a etiqueta "${t.nome}"?`;
    if (!confirm(aviso)) return;
    setOcupado(true); setErro('');
    const r = await fetch(`/api/tags/${t.id}`, { method: 'DELETE' });
    setOcupado(false);
    if (!r.ok) { setErro('Não foi possível excluir.'); return; }
    carregar();
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-card)', marginBottom: 8 }}>
      <button onClick={() => setAberto(v => !v)}
        style={{ width: '100%', textAlign: 'left', padding: '12px 16px', background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 10 }}>
        Etiquetas
        <span style={{ fontSize: 10, fontWeight: 600, background: 'var(--field-bg)', border: '1px solid var(--hairline)', color: 'var(--text-muted)', borderRadius: 999, padding: '1px 8px' }}>{tags.length}</span>
        <span style={{ fontSize: 10.5, fontWeight: 500, color: 'var(--accent-light)' }}>editável</span>
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 12 }}>{aberto ? '▾' : '▸'}</span>
      </button>

      {aberto && (
        <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '12px 16px' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input value={nova} onChange={e => setNova(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') criar(nova); }}
              placeholder="Nome da nova etiqueta" style={{ ...CAMPO, flex: 1 }} />
            <button onClick={() => criar(nova)} disabled={ocupado || !nova.trim()}
              style={{ ...BTN, background: 'var(--accent)', color: '#fff', borderColor: 'transparent', opacity: (ocupado || !nova.trim()) ? 0.5 : 1 }}>
              Criar
            </button>
          </div>

          {erro && <div style={{ fontSize: 11.5, color: 'var(--red, #ef4444)', marginBottom: 10 }}>{erro}</div>}

          {tags.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '6px 0' }}>Nenhuma etiqueta cadastrada ainda.</div>}

          {tags.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
              {editando === t.id ? (
                <>
                  <input value={rascunho} onChange={e => setRascunho(e.target.value)} autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') renomear(t.id); if (e.key === 'Escape') setEditando(null); }}
                    style={{ ...CAMPO, flex: 1 }} />
                  <button onClick={() => renomear(t.id)} disabled={ocupado} style={BTN}>Salvar</button>
                  <button onClick={() => { setEditando(null); setErro(''); }} style={BTN}>Cancelar</button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-secondary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.nome}</span>
                  <span style={{ fontSize: 10.5, color: 'var(--text-muted)', flexShrink: 0 }}>
                    {t.contatos} contato{t.contatos === 1 ? '' : 's'}
                  </span>
                  <button onClick={() => { setEditando(t.id); setRascunho(t.nome); setErro(''); }} style={BTN}>Renomear</button>
                  <button onClick={() => excluir(t)} style={BTN}>Excluir</button>
                </>
              )}
            </div>
          ))}

          {/* Etiquetas que alguém digitou direto no contato e nunca entraram no catálogo */}
          {orfas.length > 0 && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 8 }}>
                Em uso nos contatos, fora do catálogo — clique para adicionar:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {orfas.map(o => (
                  <button key={o.nome} onClick={() => criar(o.nome)} disabled={ocupado}
                    style={{ ...BTN, fontSize: 11 }}>
                    + {o.nome} <span style={{ color: 'var(--text-muted)' }}>({o.contatos})</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
