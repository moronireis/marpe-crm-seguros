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
  marpe_contacts: { id: string; name: string; phone: string | null; email: string | null; city: string | null } | null;
}

interface Props {
  deal: Deal;
  onSave: (updates: Record<string, unknown>) => Promise<void>;
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
  input: { width: '100%', boxSizing: 'border-box' as const, padding: '6px 8px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit', outline: 'none' } as React.CSSProperties,
  select: { width: '100%', boxSizing: 'border-box' as const, padding: '6px 8px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit', outline: 'none', cursor: 'pointer' } as React.CSSProperties,
  textarea: { width: '100%', boxSizing: 'border-box' as const, padding: '6px 8px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit', outline: 'none', resize: 'vertical' as const, minHeight: 60 } as React.CSSProperties,
  saveBtn: { padding: '6px 14px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 } as React.CSSProperties,
  checkbox: { accentColor: 'var(--accent)', margin: 0 } as React.CSSProperties,
};

export default function DealTabInfo({ deal, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});

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
      veiculo: deal.veiculo || '',
      placa: deal.placa || '',
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
          <div style={s.row}><span style={s.label}>Ramo</span><span style={s.value}>{deal.ramo || '—'}</span></div>
          <div style={s.row}><span style={s.label}>Seguradora</span><span style={s.value}>{deal.seguradora || '—'}</span></div>
          <div style={s.row}><span style={s.label}>Apólice</span><span style={s.value}>{deal.apolice || '—'}</span></div>
          {deal.campanha && <div style={s.row}><span style={s.label}>Campanha</span><span style={s.value}>{deal.campanha}</span></div>}
          {deal.veiculo && <div style={s.row}><span style={s.label}>Veículo</span><span style={s.value}>{deal.veiculo}</span></div>}
          {deal.placa && <div style={s.row}><span style={s.label}>Placa</span><span style={s.value}>{deal.placa}</span></div>}
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
          {deal.base_calculo_repasse && <div style={s.row}><span style={s.label}>Base Repasse</span><span style={s.value}>R$ {fmt(deal.base_calculo_repasse)}</span></div>}
          {deal.pct_repasse && <div style={s.row}><span style={s.label}>% Repasse</span><span style={s.value}>{deal.pct_repasse}%</span></div>}
          {deal.valor_repasse && <div style={s.row}><span style={s.label}>Vr. Repasse</span><span style={s.value}>R$ {fmt(deal.valor_repasse)}</span></div>}
        </div>

        {/* Produtores */}
        <div style={s.section}>
          <div style={s.sectionTitle}>Produtores</div>
          <div style={s.row}><span style={s.label}>Produtor</span><span style={s.value}>{deal.produtor || '—'}</span></div>
          <div style={s.row}><span style={s.label}>Agente</span><span style={s.value}>{deal.agente || '—'}</span></div>
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
            <select value={form.ramo} onChange={field('ramo')} style={s.select}>
              <option value="">— Selecione —</option>
              <option value="auto">Auto</option>
              <option value="vida">Vida</option>
              <option value="residencial">Residencial</option>
              <option value="empresarial">Empresarial</option>
              <option value="equipamento">Equipamento</option>
              <option value="consorcio">Consórcio</option>
              <option value="financiamento">Financiamento</option>
              <option value="rcge">RCGE</option>
            </select>
          </div>
        </div>
        <div style={{ marginTop: 8 }}>
          <label style={s.label}>Seguradora</label>
          <input value={form.seguradora} onChange={field('seguradora')} placeholder="Ex: Porto Seguro" style={s.input} />
        </div>
        <div style={{ marginTop: 8 }}>
          <label style={s.label}>Apólice</label>
          <input value={form.apolice} onChange={field('apolice')} placeholder="Número da apólice" style={s.input} />
        </div>
        <div style={{ marginTop: 8 }}>
          <label style={s.label}>Campanha</label>
          <input value={form.campanha} onChange={field('campanha')} placeholder="Campanha (opcional)" style={s.input} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
          <div>
            <label style={s.label}>Veículo</label>
            <input value={form.veiculo} onChange={field('veiculo')} placeholder="Opcional" style={s.input} />
          </div>
          <div>
            <label style={s.label}>Placa</label>
            <input value={form.placa} onChange={field('placa')} placeholder="Opcional" style={s.input} />
          </div>
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
            <label style={s.label}>Base Repasse</label>
            <input type="number" min="0" step="0.01" value={form.base_calculo_repasse} onChange={field('base_calculo_repasse')} style={s.input} />
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
            <input value={form.produtor} onChange={field('produtor')} style={s.input} />
          </div>
          <div>
            <label style={s.label}>Agente</label>
            <input value={form.agente} onChange={field('agente')} style={s.input} />
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
