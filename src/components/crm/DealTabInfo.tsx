import { useState, useEffect } from 'react';

interface Deal {
  id: string; title: string; ramo: string | null; seguradora: string | null; apolice: string | null;
  premio: number | null; comissao_pct: number | null; comissao_valor: number | null;
  vigencia_inicio: string | null; vigencia_fim: string | null; veiculo: string | null; placa: string | null;
  deal_type: string | null; next_action: string | null; next_action_date: string | null;
  stage_id: string; funnel_id: string;
  status_custom: string | null; status_color: string | null;
  // New fields
  campanha: string | null; ja_possui_produto: boolean; seguradora_atual: string | null;
  vigencia_atual_fim: string | null; corretora_atual: string | null;
  base_calculo_repasse: number | null; pct_repasse: number | null; valor_repasse: number | null;
  agente: string | null; observacoes_proposta: string | null; produtor: string | null;
  responsible_id: string | null;
  detalhes_corp?: Record<string, any> | null;
  marpe_profiles: { id: string; full_name: string } | null;
  marpe_contacts: { id: string; name: string; phone: string | null; email: string | null; city: string | null } | null;
}

interface Props {
  deal: Deal;
  onSave: (updates: Record<string, unknown>) => Promise<void>;
  /** Usuário logado — responsável padrão quando o negócio não tem um (checkpoint 14/07) */
  currentUser?: { id: string; full_name: string };
}

// Pick-lists do Corp para a edição (checkpoint 10/07, item 6)
interface InfoLookups {
  seguradoras: { codigo: number; nome: string }[];
  produtores: { codigo: number; nome: string }[];
  agentes: { codigo: number; nome: string }[];
  ramos?: { codigo: number; nome: string; abreviatura?: string }[];
  campanhas: string[];
  campanhas_cod?: number[];
  bases_repasse?: number[];
}

// #36: o sync guarda o ramo como abreviação da lista do Corp ("empr") — resolve o
// nome completo ("EMPRESARIAL") via codram (detalhes_corp) ou pela abreviatura.
function resolveRamoNome(deal: Deal, lookups: InfoLookups | null): string {
  const ramos = lookups?.ramos || [];
  const codram = deal.detalhes_corp?.codram;
  if (codram) {
    const byCod = ramos.find(r => r.codigo === Number(codram));
    if (byCod) return byCod.nome;
  }
  if (deal.ramo) {
    const ab = deal.ramo.toLowerCase();
    const byAb = ramos.find(r => (r.abreviatura || '').toLowerCase() === ab || r.nome.toLowerCase() === ab);
    if (byAb) return byAb.nome;
    return deal.ramo.toUpperCase();
  }
  return '—';
}

function fmt(v: number | null | undefined) {
  if (!v && v !== 0) return '';
  return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

function fmtDate(d: string | null) {
  if (!d) return '';
  return d; // return raw ISO date for input fields
}

function displayDate(d: string | null) {
  if (!d) return '—';
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR');
}

const DEAL_TYPES: Record<string, string> = {
  prospeccao: 'Prospecção', renovacao: 'Renovação', resgate: 'Resgate',
  venda_cruzada: 'Venda Cruzada', endosso: 'Endosso',
};

const s = {
  section: { marginBottom: 20 } as React.CSSProperties,
  sectionTitle: { fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 10, paddingBottom: 4, borderBottom: '1px solid var(--border-subtle)' } as React.CSSProperties,
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', minHeight: 28, gap: 8 } as React.CSSProperties,
  label: { fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, minWidth: 100 } as React.CSSProperties,
  value: { fontSize: 12, color: 'var(--text-primary)', fontWeight: 500, textAlign: 'right' as const, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const } as React.CSSProperties,
  input: { width: '100%', boxSizing: 'border-box' as const, padding: '6px 8px', background: 'var(--field-bg)', border: '1px solid var(--hairline)', borderRadius: 9, color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit', outline: 'none' } as React.CSSProperties,
  select: { width: '100%', boxSizing: 'border-box' as const, padding: '6px 8px', background: 'var(--field-bg)', border: '1px solid var(--hairline)', borderRadius: 9, color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit', outline: 'none', cursor: 'pointer' } as React.CSSProperties,
  textarea: { width: '100%', boxSizing: 'border-box' as const, padding: '6px 8px', background: 'var(--field-bg)', border: '1px solid var(--hairline)', borderRadius: 9, color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit', outline: 'none', resize: 'vertical' as const, minHeight: 60 } as React.CSSProperties,
  saveBtn: { padding: '6px 14px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 } as React.CSSProperties,
  checkbox: { accentColor: 'var(--accent)', margin: 0 } as React.CSSProperties,
};

export default function DealTabInfo({ deal, onSave, currentUser }: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const [lookups, setLookups] = useState<InfoLookups | null>(null);
  const [users, setUsers] = useState<{ id: string; full_name: string }[]>([]);
  const [campanhaLivre, setCampanhaLivre] = useState(false);

  // Pick-lists do Corp + usuários ao entrar no modo edição (lookups cacheia 10 min)
  useEffect(() => {
    if (!editing) return;
    if (!lookups) {
      fetch('/api/corp/lookups')
        .then(r => r.json())
        .then(d => setLookups(d))
        .catch(() => {});
    }
    if (!users.length) {
      fetch('/api/users')
        .then(r => r.json())
        .then(d => setUsers(d.users || []))
        .catch(() => {});
    }
  }, [editing, lookups, users.length]);

  // Select que degrada para o valor atual quando a lista Corp não carregou
  function corpSelect(key: string, options: { nome: string }[] | undefined, placeholder: string) {
    const current = String(form[key] ?? '');
    if (!options?.length) {
      return <input value={current} onChange={field(key)} placeholder={placeholder} style={s.input} />;
    }
    const inList = options.some(o => o.nome === current);
    return (
      <select value={current} onChange={field(key)} style={s.select}>
        <option value="">— Selecione —</option>
        {current && !inList && <option value={current}>{current} (atual)</option>}
        {options.map(o => <option key={o.nome} value={o.nome}>{o.nome}</option>)}
      </select>
    );
  }

  useEffect(() => {
    setForm({
      ramo: deal.ramo || '',
      seguradora: deal.seguradora || '',
      apolice: deal.apolice || '',
      deal_type: deal.deal_type || 'prospeccao',
      campanha: deal.campanha || '',
      premio: deal.premio ?? '',
      comissao_pct: deal.comissao_pct ?? '',
      comissao_valor: deal.comissao_valor ?? '',
      vigencia_inicio: deal.vigencia_inicio || '',
      vigencia_fim: deal.vigencia_fim || '',
      // Responsável: negócio sem responsável assume o usuário logado (checkpoint 14/07)
      responsible_id: deal.responsible_id || currentUser?.id || '',
      // Produto Atual
      ja_possui_produto: deal.ja_possui_produto ?? false,
      seguradora_atual: deal.seguradora_atual || '',
      vigencia_atual_fim: deal.vigencia_atual_fim || '',
      corretora_atual: deal.corretora_atual || '',
      // Estimativas
      base_calculo_repasse: deal.base_calculo_repasse ?? '',
      pct_repasse: deal.pct_repasse ?? '',
      valor_repasse: deal.valor_repasse ?? '',
      // Produtores
      produtor: deal.produtor || '',
      agente: deal.agente || '',
      // Detalhes
      observacoes_proposta: deal.observacoes_proposta || '',
      next_action: deal.next_action || '',
      next_action_date: deal.next_action_date || '',
    });
    setCampanhaLivre(false);
  }, [deal]);

  function field(key: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));
  }

  async function handleSave() {
    setSaving(true);
    const updates: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(form)) {
      if (key === 'ja_possui_produto') {
        updates[key] = val;
      } else if (['premio', 'comissao_pct', 'comissao_valor', 'base_calculo_repasse', 'pct_repasse', 'valor_repasse'].includes(key)) {
        updates[key] = val !== '' ? parseFloat(val) : null;
      } else {
        updates[key] = val || null;
      }
    }
    await onSave(updates);
    setSaving(false);
    setEditing(false);
  }

  const contact = deal.marpe_contacts;

  // Read-only view
  if (!editing) {
    return (
      <div>
        {/* Contact info */}
        {contact && (
          <div style={s.section}>
            <div style={{ ...s.sectionTitle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Contato</span>
              <a href={`/contato/${contact.id}`} style={{ fontSize: 11, color: 'var(--accent-light)', textDecoration: 'none', fontWeight: 500, textTransform: 'none' }}>Ver perfil →</a>
            </div>
            {contact.phone && <div style={s.row}><span style={s.label}>Telefone</span><span style={s.value}>{contact.phone}</span></div>}
            {contact.email && <div style={s.row}><span style={s.label}>E-mail</span><span style={s.value}>{contact.email}</span></div>}
            {contact.city && <div style={s.row}><span style={s.label}>Cidade</span><span style={s.value}>{contact.city}</span></div>}
          </div>
        )}

        {/* Dados Gerais */}
        <div style={s.section}>
          <div style={{ ...s.sectionTitle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Dados Gerais</span>
            <button onClick={() => setEditing(true)} style={{ fontSize: 10, color: 'var(--accent-light)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textTransform: 'none', fontWeight: 500 }}>Editar</button>
          </div>
          <div style={s.row}><span style={s.label}>Tipo</span><span style={s.value}>{DEAL_TYPES[deal.deal_type || ''] || '—'}</span></div>
          <div style={s.row}><span style={s.label}>Ramo</span><span style={s.value}>{resolveRamoNome(deal, lookups)}</span></div>
          <div style={s.row}><span style={s.label}>Seguradora</span><span style={s.value}>{deal.seguradora || '—'}</span></div>
          {/* Apólice: campo removido dos formulários (issue #11); exibe apenas
              quando veio preenchida do sync de apólices do Corp */}
          {deal.apolice && <div style={s.row}><span style={s.label}>Apólice</span><span style={s.value}>{deal.apolice}</span></div>}
          {deal.campanha && <div style={s.row}><span style={s.label}>Campanha</span><span style={s.value}>{deal.campanha}</span></div>}
          <div style={s.row}><span style={s.label}>Responsável</span><span style={s.value}>{deal.marpe_profiles?.full_name || '—'}</span></div>
          <div style={s.row}><span style={s.label}>Vigência Início</span><span style={s.value}>{displayDate(deal.vigencia_inicio)}</span></div>
          <div style={s.row}><span style={s.label}>Vigência Fim</span><span style={s.value}>{displayDate(deal.vigencia_fim)}</span></div>
        </div>

        {/* Produto Atual */}
        {deal.ja_possui_produto && (
          <div style={s.section}>
            <div style={s.sectionTitle}>Produto Atual</div>
            <div style={s.row}><span style={s.label}>Seguradora Atual</span><span style={s.value}>{deal.seguradora_atual || '—'}</span></div>
            <div style={s.row}><span style={s.label}>Vigência Atual Fim</span><span style={s.value}>{displayDate(deal.vigencia_atual_fim)}</span></div>
            <div style={s.row}><span style={s.label}>Corretora Atual</span><span style={s.value}>{deal.corretora_atual || '—'}</span></div>
          </div>
        )}

        {/* Estimativas e Valores */}
        <div style={s.section}>
          <div style={s.sectionTitle}>Estimativas e Valores</div>
          <div style={s.row}><span style={s.label}>Prêmio</span><span style={s.value}>{deal.premio ? `R$ ${fmt(deal.premio)}` : '—'}</span></div>
          <div style={s.row}><span style={s.label}>% Comissão</span><span style={s.value}>{deal.comissao_pct ? `${deal.comissao_pct}%` : '—'}</span></div>
          <div style={s.row}><span style={s.label}>Vr. Comissão</span><span style={s.value}>{deal.comissao_valor ? `R$ ${fmt(deal.comissao_valor)}` : '—'}</span></div>
          {deal.base_calculo_repasse != null && <div style={s.row}><span style={s.label}>Base de Cálc. Repasse</span><span style={s.value}>{deal.base_calculo_repasse === 5 ? 'Com. Corretora' : `Código ${deal.base_calculo_repasse}`}</span></div>}
          {deal.pct_repasse && <div style={s.row}><span style={s.label}>% Repasse</span><span style={s.value}>{deal.pct_repasse}%</span></div>}
          {deal.valor_repasse && <div style={s.row}><span style={s.label}>Vr. Repasse</span><span style={s.value}>R$ {fmt(deal.valor_repasse)}</span></div>}
        </div>

        {/* Produtores */}
        <div style={s.section}>
          <div style={s.sectionTitle}>Produtores</div>
          <div style={s.row}><span style={s.label}>Produtor</span><span style={s.value}>{deal.produtor || '—'}</span></div>
          <div style={s.row}><span style={s.label}>Agente</span><span style={s.value}>{deal.agente || '—'}</span></div>
          {/* #36: auditoria do Corp — quem digitou e o código do responsável (nome
              depende de endpoint de usuários solicitado à Agia) */}
          {deal.detalhes_corp?.criado_por && (
            <div style={s.row}><span style={s.label}>Criado no Corp por</span><span style={s.value}>{deal.detalhes_corp.criado_por}</span></div>
          )}
          {deal.detalhes_corp?.codusu_responsavel != null && (
            <div style={s.row}><span style={s.label}>Responsável (Corp)</span><span style={s.value}>Usuário #{deal.detalhes_corp.codusu_responsavel}</span></div>
          )}
        </div>

        {/* Próxima Ação */}
        <div style={s.section}>
          <div style={s.sectionTitle}>Próxima Ação</div>
          <div style={s.row}><span style={s.label}>Data</span><span style={s.value}>{displayDate(deal.next_action_date)}</span></div>
          {deal.next_action && <div style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-card)', borderRadius: 6, padding: 8, marginTop: 4 }}>{deal.next_action}</div>}
        </div>

        {/* Observações */}
        {deal.observacoes_proposta && (
          <div style={s.section}>
            <div style={s.sectionTitle}>Observações</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', background: 'var(--bg-card)', borderRadius: 6, padding: 8, whiteSpace: 'pre-wrap' }}>{deal.observacoes_proposta}</div>
          </div>
        )}
      </div>
    );
  }

  // Edit mode
  return (
    <div>
      <div style={{ ...s.sectionTitle, display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span>Editar Negócio</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setEditing(false)} style={{ ...s.saveBtn, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>Cancelar</button>
          <button onClick={handleSave} disabled={saving} style={{ ...s.saveBtn, opacity: saving ? 0.6 : 1 }}>{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>

      {/* Dados Gerais */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Dados Gerais</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label style={s.label}>Tipo</label>
            <select value={form.deal_type} onChange={field('deal_type')} style={s.select}>
              {Object.entries(DEAL_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label style={s.label}>Ramo</label>
            {/* #36: ramos vivos do Corp quando os lookups respondem (valor continua a
                abreviação minúscula — formato que o sync grava); fallback estático */}
            <select value={form.ramo} onChange={field('ramo')} style={s.select}>
              <option value="">— Selecione —</option>
              {lookups?.ramos?.length ? (
                lookups.ramos.map(r => {
                  const val = (r.abreviatura || r.nome).toLowerCase();
                  return <option key={r.codigo} value={val}>{r.nome}</option>;
                })
              ) : (<>
                <option value="auto">Auto</option>
                <option value="vida">Vida</option>
                <option value="residencial">Residencial</option>
                <option value="empresarial">Empresarial</option>
                <option value="equipamento">Equipamento</option>
                <option value="consorcio">Consórcio</option>
                <option value="financiamento">Financiamento</option>
                <option value="rcge">RCGE</option>
              </>)}
              {form.ramo && lookups?.ramos?.length && !lookups.ramos.some(r => (r.abreviatura || r.nome).toLowerCase() === form.ramo) && (
                <option value={form.ramo}>{form.ramo.toUpperCase()}</option>
              )}
            </select>
          </div>
        </div>
        <div style={{ marginTop: 8 }}>
          <label style={s.label}>Seguradora</label>
          {corpSelect('seguradora', lookups?.seguradoras, 'Ex: Porto Seguro')}
        </div>
        <div style={{ marginTop: 8 }}>
          <label style={s.label}>Campanha</label>
          <select
            value={campanhaLivre ? '__livre' : (form.campanha || '')}
            onChange={e => {
              if (e.target.value === '__livre') { setCampanhaLivre(true); setForm(f => ({ ...f, campanha: '' })); }
              else { setCampanhaLivre(false); setForm(f => ({ ...f, campanha: e.target.value })); }
            }}
            style={s.select}
          >
            <option value="">—</option>
            {form.campanha && !campanhaLivre
              && !(lookups?.campanhas || []).includes(form.campanha)
              && !(lookups?.campanhas_cod || []).some(c => `Campanha ${c}` === form.campanha)
              && <option value={form.campanha}>{form.campanha} (atual)</option>}
            {(lookups?.campanhas || []).map(c => <option key={`n${c}`} value={c}>{c}</option>)}
            {(lookups?.campanhas_cod || []).map(c => <option key={`c${c}`} value={`Campanha ${c}`}>Campanha {c} (Corp)</option>)}
            <option value="__livre">Outra (digitar)...</option>
          </select>
          {campanhaLivre && (
            <input value={form.campanha} onChange={field('campanha')} placeholder="Nome da campanha" autoFocus style={{ ...s.input, marginTop: 6 }} />
          )}
        </div>
        <div style={{ marginTop: 8 }}>
          <label style={s.label}>Responsável</label>
          {users.length ? (
            <select value={form.responsible_id || ''} onChange={field('responsible_id')} style={s.select}>
              <option value="">—</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.full_name}{u.id === currentUser?.id ? ' (você)' : ''}</option>)}
            </select>
          ) : (
            <input value={currentUser?.full_name || ''} disabled readOnly style={{ ...s.input, opacity: 0.75 }} />
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
          <div>
            <label style={s.label}>Vigência Início</label>
            <input type="date" value={form.vigencia_inicio} onChange={field('vigencia_inicio')} style={s.input} />
          </div>
          <div>
            <label style={s.label}>Vigência Fim</label>
            <input type="date" value={form.vigencia_fim} onChange={field('vigencia_fim')} style={s.input} />
          </div>
        </div>
      </div>

      {/* Produto Atual */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Produto Atual</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer', marginBottom: 8 }}>
          <input type="checkbox" checked={form.ja_possui_produto} onChange={e => setForm(f => ({ ...f, ja_possui_produto: e.target.checked }))} style={s.checkbox} />
          Já possui o produto
        </label>
        {form.ja_possui_produto && (
          <>
            <div style={{ marginTop: 8 }}>
              <label style={s.label}>Seguradora Atual</label>
              <input value={form.seguradora_atual} onChange={field('seguradora_atual')} style={s.input} />
            </div>
            <div style={{ marginTop: 8 }}>
              <label style={s.label}>Fim de Vigência Atual</label>
              <input type="date" value={form.vigencia_atual_fim} onChange={field('vigencia_atual_fim')} style={s.input} />
            </div>
            <div style={{ marginTop: 8 }}>
              <label style={s.label}>Corretora Atual</label>
              <input value={form.corretora_atual} onChange={field('corretora_atual')} style={s.input} />
            </div>
          </>
        )}
      </div>

      {/* Estimativas e Valores */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Estimativas e Valores</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label style={s.label}>Prêmio (R$)</label>
            <input type="number" min="0" step="0.01" value={form.premio} onChange={field('premio')} style={s.input} />
          </div>
          <div>
            <label style={s.label}>% Comissão</label>
            <input type="number" min="0" max="100" step="0.1" value={form.comissao_pct} onChange={field('comissao_pct')} style={s.input} />
          </div>
        </div>
        <div style={{ marginTop: 8 }}>
          <label style={s.label}>Vr. Comissão (R$)</label>
          <input type="number" min="0" step="0.01" value={form.comissao_valor} onChange={field('comissao_valor')} style={s.input} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 8 }}>
          <div>
            <label style={s.label}>Base de Cálc. Repasse</label>
            <select value={String(form.base_calculo_repasse ?? '')} onChange={field('base_calculo_repasse')} style={s.select}>
              <option value="">—</option>
              {[...new Set([...(lookups?.bases_repasse || [5]), ...(form.base_calculo_repasse ? [Number(form.base_calculo_repasse)] : [])])].sort((a, b) => a - b).map(b => (
                <option key={b} value={String(b)}>{b === 5 ? 'Com. Corretora (padrão)' : `Código ${b}`}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={s.label}>% Repasse</label>
            <input type="number" min="0" max="100" step="0.1" value={form.pct_repasse} onChange={field('pct_repasse')} style={s.input} />
          </div>
          <div>
            <label style={s.label}>Vr. Repasse</label>
            <input type="number" min="0" step="0.01" value={form.valor_repasse} onChange={field('valor_repasse')} style={s.input} />
          </div>
        </div>
      </div>

      {/* Produtores */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Produtores</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label style={s.label}>Produtor</label>
            {corpSelect('produtor', lookups?.produtores, 'Nome do produtor')}
          </div>
          <div>
            <label style={s.label}>Agente</label>
            {corpSelect('agente', lookups?.agentes, 'Nome do agente')}
          </div>
        </div>
      </div>

      {/* Próxima Ação */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Próxima Ação</div>
        <div>
          <label style={s.label}>Data</label>
          <input type="date" value={form.next_action_date} onChange={field('next_action_date')} style={s.input} />
        </div>
        <div style={{ marginTop: 8 }}>
          <label style={s.label}>Descrição</label>
          <textarea value={form.next_action} onChange={field('next_action')} placeholder="Próxima ação ou observação..." style={s.textarea} />
        </div>
      </div>

      {/* Observações */}
      <div style={s.section}>
        <div style={s.sectionTitle}>Observações da Proposta</div>
        <textarea value={form.observacoes_proposta} onChange={field('observacoes_proposta')} placeholder="Detalhes adicionais..." rows={4} style={s.textarea} />
      </div>
    </div>
  );
}
