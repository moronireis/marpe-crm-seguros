import { useState, useEffect } from 'react';
import { maskPhone, maskCpfCnpj, maskCep, validPhone, validEmail, validCpfCnpj } from '../../lib/masks';

// Cadastro de Novo Cliente integrado ao Corp: grava no Corp (cliente + telefone +
// endereço + e-mail) e depois no CRM com o vínculo corp_id. Espelha a aba Cadastro
// da tela "Cadastro de Clientes" do Corp. CEP consulta o ViaCEP.

const INPUT_S: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '8px 11px',
  background: 'var(--field-bg)', border: '1px solid var(--hairline)',
  borderRadius: 10, color: 'var(--text-primary)', fontSize: 13,
  fontFamily: 'inherit', outline: 'none',
  transition: 'border-color 0.2s var(--ease-out), box-shadow 0.2s var(--ease-out)',
};
const LABEL_S: React.CSSProperties = {
  display: 'block', fontSize: 11, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4,
};

interface Profissao { codigo: number; profissao: string; }
interface LookupSimples { codigo: number; descricao: string; }

interface ContactForm {
  name: string; pessoa: 'F' | 'J'; cpf_cnpj: string; birth_date: string; sexo: string;
  profession: string; phone: string; email: string;
  cep: string; logradouro: string; numero_end: string; complemento: string;
  bairro: string; city: string; state: string; notes: string;
  // S3 (PDF Sync §1 e §10, 27/07)
  estado_civil: string;      // PF — lookup do Corp
  escolaridade: string;      // "Informações adicionais" — lookup do Corp
  cnh_vencimento: string;    // PF — só CRM
  contato_empresa: string;   // PJ — só CRM ("é onde será feita toda a comunicação")
}

const EMPTY: ContactForm = {
  name: '', pessoa: 'F', cpf_cnpj: '', birth_date: '', sexo: '',
  profession: '', phone: '', email: '',
  cep: '', logradouro: '', numero_end: '', complemento: '',
  bairro: '', city: '', state: 'RS', notes: '',
  estado_civil: '', escolaridade: '', cnh_vencimento: '', contato_empresa: '',
};

export default function NewContactModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (contact: any, warnings: string[]) => void;
}) {
  const [form, setForm] = useState<ContactForm>(EMPTY);
  const [profissoes, setProfissoes] = useState<Profissao[]>([]);
  const [estadosCivis, setEstadosCivis] = useState<LookupSimples[]>([]);
  const [escolaridades, setEscolaridades] = useState<LookupSimples[]>([]);
  const [cepLoading, setCepLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // S3: aviso de duplicidade (PDF Sync, regra geral)
  const [dupe, setDupe] = useState<{ checking: boolean; corp: any[]; crm: any[] } | null>(null);

  const isPJ = form.pessoa === 'J';

  useEffect(() => {
    fetch('/api/corp/lookups')
      .then(r => r.json())
      .then(d => {
        setProfissoes(d.profissoes || []);
        setEstadosCivis(d.estados_civis || []);
        setEscolaridades(d.escolaridades || []);
      })
      .catch(() => {});
  }, []);

  function field(key: keyof ContactForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));
  }

  /**
   * S3: o PDF pede que o campo "identifique automaticamente se é pessoa física ou
   * jurídica apenas pelos números informados". 11 dígitos → PF, 14 → PJ.
   * Quando fecha a contagem, também checa duplicidade no Corp e no CRM.
   */
  function handleCpfCnpjChange(value: string) {
    const masked = maskCpfCnpj(value);
    const digits = masked.replace(/\D/g, '');
    setForm(f => ({
      ...f,
      cpf_cnpj: masked,
      pessoa: digits.length > 11 ? 'J' : digits.length === 11 ? 'F' : f.pessoa,
    }));
    if (digits.length === 11 || digits.length === 14) checkDuplicate(digits);
    else setDupe(null);
  }

  async function checkDuplicate(digits: string) {
    setDupe({ checking: true, corp: [], crm: [] });
    try {
      const r = await fetch(`/api/corp/busca-cpf?cpf_cnpj=${digits}`);
      const d = await r.json();
      if (!r.ok) { setDupe(null); return; }
      setDupe(d.duplicate ? { checking: false, corp: d.corp || [], crm: d.crm || [] } : null);
    } catch {
      setDupe(null); // consulta é conveniência — nunca trava o cadastro
    }
  }

  // ViaCEP: 8 dígitos → preenche logradouro/bairro/cidade/UF
  async function handleCepChange(value: string) {
    setForm(f => ({ ...f, cep: value }));
    const digits = value.replace(/\D/g, '');
    if (digits.length !== 8) return;
    setCepLoading(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const d = await r.json();
      if (!d.erro) {
        setForm(f => ({
          ...f,
          logradouro: d.logradouro || f.logradouro,
          bairro: d.bairro || f.bairro,
          city: d.localidade || f.city,
          state: d.uf || f.state,
        }));
      }
    } catch { /* CEP lookup é conveniência — segue sem preencher */ }
    setCepLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('Nome é obrigatório.'); return; }
    // Validação de tipos (issue #12) — bloqueia telefone/e-mail/CPF inválidos
    if (!validPhone(form.phone)) { setError('Telefone inválido — use DDD + número (10 ou 11 dígitos).'); return; }
    if (!validEmail(form.email)) { setError('E-mail inválido.'); return; }
    if (!validCpfCnpj(form.cpf_cnpj)) { setError('CPF/CNPJ inválido — confira os dígitos.'); return; }
    setSubmitting(true);
    const res = await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        corp: true,
        name: form.name.trim().toUpperCase(),
        pessoa: form.pessoa,
        cpf_cnpj: form.cpf_cnpj || null,
        birth_date: form.birth_date || null,
        // PJ não tem sexo (PDF Sync §10) — não manda nem null "por engano"
        sexo: isPJ ? null : (form.sexo || null),
        profession: form.profession || null,
        // S3: códigos do Corp (o POST /cliente aceita, validado no probe de 27/07)
        estado_civil: !isPJ && form.estado_civil ? Number(form.estado_civil) : null,
        escolaridade: form.escolaridade ? Number(form.escolaridade) : null,
        // Só CRM — a API do Corp não expõe estes campos
        cnh_vencimento: !isPJ ? (form.cnh_vencimento || null) : null,
        contato_empresa: isPJ ? (form.contato_empresa || null) : null,
        phone: form.phone || null,
        email: form.email || null,
        cep: form.cep || null,
        logradouro: form.logradouro || null,
        numero_end: form.numero_end || null,
        complemento: form.complemento || null,
        bairro: form.bairro || null,
        city: form.city || null,
        state: form.state || null,
        notes: form.notes || null,
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) { setError(data.error || 'Erro ao cadastrar cliente.'); return; }
    onCreated(data.contact, data.warnings || []);
    onClose();
  }

  return (
    <div
      className="overlay-glass"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="glass-modal modal-pop" style={{
        borderRadius: 'var(--radius-xl)', width: 560, maxWidth: 'calc(100vw - 32px)', maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>Novo Cliente</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 10 }}>grava no Corp e no CRM</span>
          </div>
          <button onClick={onClose} aria-label="Fechar" style={{ width: 30, height: 30, borderRadius: 9, border: '1px solid var(--hairline)', background: 'var(--field-bg)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit', transition: 'all 0.2s var(--ease-out)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={LABEL_S}>Nome *</label>
            <input value={form.name} onChange={field('name')} placeholder="Nome completo" autoFocus style={INPUT_S} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 1fr', gap: 12 }}>
            <div>
              <label style={LABEL_S}>Pessoa</label>
              <select value={form.pessoa} onChange={field('pessoa')} style={{ ...INPUT_S, cursor: 'pointer' }}>
                <option value="F">Física</option>
                <option value="J">Jurídica</option>
              </select>
            </div>
            <div>
              <label style={LABEL_S}>{isPJ ? 'CNPJ' : 'CPF'}</label>
              <input value={form.cpf_cnpj} onChange={e => handleCpfCnpjChange(e.target.value)} inputMode="numeric" placeholder={isPJ ? '00.000.000/0000-00' : '000.000.000-00'} style={INPUT_S} />
            </div>
            <div>
              {/* PDF Sync §10: em PJ, "nascimento" vira "fundação" */}
              <label style={LABEL_S}>{isPJ ? 'Fundação' : 'Nascimento'}</label>
              <input type="date" value={form.birth_date} onChange={field('birth_date')} style={INPUT_S} />
            </div>
          </div>

          {/* S3: duplicidade — avisa, não bloqueia (pode ser recadastro legítimo) */}
          {dupe && !dupe.checking && (
            <div style={{ padding: '9px 12px', background: 'var(--amber-dim)', border: '1px solid rgba(217,119,6,0.3)', borderRadius: 9, fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--amber)' }}>Já existe cadastro com este {isPJ ? 'CNPJ' : 'CPF'}.</strong>
              {dupe.corp.length > 0 && <div>No Corp: {dupe.corp.map(c => `${c.nome || '—'}${c.codigo ? ` (cód. ${c.codigo})` : ''}`).join(' · ')}</div>}
              {dupe.crm.length > 0 && <div>No CRM: {dupe.crm.map((c: any) => c.name).join(' · ')}</div>}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: isPJ ? '1fr 1fr' : '110px 1fr 1fr', gap: 12 }}>
            {/* PDF Sync §10: em PJ o campo sexo some */}
            {!isPJ && (
              <div>
                <label style={LABEL_S}>Sexo</label>
                <select value={form.sexo} onChange={field('sexo')} style={{ ...INPUT_S, cursor: 'pointer' }}>
                  <option value="">—</option>
                  <option value="M">Masculino</option>
                  <option value="F">Feminino</option>
                </select>
              </div>
            )}
            <div>
              {/* PDF Sync §10: em PJ, "profissão" vira "atividade" */}
              <label style={LABEL_S}>{isPJ ? 'Atividade' : 'Profissão'}</label>
              <select value={form.profession} onChange={field('profession')} style={{ ...INPUT_S, cursor: 'pointer' }}>
                <option value="">— Selecione —</option>
                {profissoes.map(p => <option key={p.codigo} value={p.profissao}>{p.profissao}</option>)}
              </select>
            </div>
            {/* PDF Sync §1: "Informações adicionais" puxadas do Corp */}
            <div>
              <label style={LABEL_S}>Escolaridade</label>
              <select value={form.escolaridade} onChange={field('escolaridade')} style={{ ...INPUT_S, cursor: 'pointer' }}>
                <option value="">— Selecione —</option>
                {escolaridades.map(x => <option key={x.codigo} value={String(x.codigo)}>{x.descricao}</option>)}
              </select>
            </div>
          </div>

          {/* PDF Sync §10: campos que só existem quando é PF */}
          {!isPJ && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={LABEL_S}>Estado civil</label>
                <select value={form.estado_civil} onChange={field('estado_civil')} style={{ ...INPUT_S, cursor: 'pointer' }}>
                  <option value="">— Selecione —</option>
                  {estadosCivis.map(x => <option key={x.codigo} value={String(x.codigo)}>{x.descricao}</option>)}
                </select>
              </div>
              <div>
                <label style={LABEL_S}>Vencimento da CNH <span style={{ textTransform: 'none', letterSpacing: 0 }}>(só CRM)</span></label>
                <input type="date" value={form.cnh_vencimento} onChange={field('cnh_vencimento')} style={INPUT_S} />
              </div>
            </div>
          )}

          {/* PDF Sync §10: em PJ, contato na empresa — "é onde será feita toda a comunicação" */}
          {isPJ && (
            <div>
              <label style={LABEL_S}>Contato na empresa <span style={{ textTransform: 'none', letterSpacing: 0 }}>(quem fala com a corretora)</span></label>
              <input value={form.contato_empresa} onChange={field('contato_empresa')} placeholder="Nome de quem responde pela empresa" style={INPUT_S} />
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={LABEL_S}>Telefone (WhatsApp)</label>
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: maskPhone(e.target.value) }))} inputMode="tel" placeholder="(55) 99999-9999" style={INPUT_S} />
            </div>
            <div>
              <label style={LABEL_S}>E-mail</label>
              <input type="email" value={form.email} onChange={field('email')} placeholder="email@exemplo.com" style={INPUT_S} />
            </div>
          </div>

          {/* Endereço */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Endereço</div>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 90px', gap: 12 }}>
              <div>
                <label style={LABEL_S}>CEP {cepLoading && <span style={{ color: 'var(--accent-light)' }}>…</span>}</label>
                <input value={form.cep} onChange={e => handleCepChange(maskCep(e.target.value))} inputMode="numeric" placeholder="00000-000" style={INPUT_S} />
              </div>
              <div>
                <label style={LABEL_S}>Endereço</label>
                <input value={form.logradouro} onChange={field('logradouro')} placeholder="Rua, avenida..." style={INPUT_S} />
              </div>
              <div>
                <label style={LABEL_S}>Número</label>
                <input value={form.numero_end} onChange={field('numero_end')} style={INPUT_S} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 70px', gap: 12, marginTop: 12 }}>
              <div>
                <label style={LABEL_S}>Complemento</label>
                <input value={form.complemento} onChange={field('complemento')} style={INPUT_S} />
              </div>
              <div>
                <label style={LABEL_S}>Bairro</label>
                <input value={form.bairro} onChange={field('bairro')} style={INPUT_S} />
              </div>
              <div>
                <label style={LABEL_S}>Cidade</label>
                <input value={form.city} onChange={field('city')} style={INPUT_S} />
              </div>
              <div>
                <label style={LABEL_S}>UF</label>
                <input value={form.state} onChange={field('state')} maxLength={2} style={INPUT_S} />
              </div>
            </div>
            {/* PDF Sync §10: "abaixo do endereço mostrar mapa". Link em vez de iframe —
                o embed do Google Maps exige chave de API e cobra por carregamento. */}
            {(form.logradouro || form.cep) && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  [form.logradouro, form.numero_end, form.bairro, form.city, form.state, form.cep]
                    .filter(Boolean).join(', ')
                )}`}
                target="_blank" rel="noopener noreferrer"
                style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 9, border: '1px solid var(--hairline)', background: 'var(--field-bg)', color: 'var(--accent-light)', fontSize: 12, fontWeight: 500, textDecoration: 'none' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                Ver no mapa
              </a>
            )}
          </div>

          <div>
            <label style={LABEL_S}>Observações (somente CRM)</label>
            <textarea value={form.notes} onChange={field('notes')} rows={2} placeholder="Anotações internas..." style={{ ...INPUT_S, resize: 'vertical', minHeight: 52 }} />
          </div>

          {error && (
            <div style={{ padding: '9px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, fontSize: 12, color: '#f87171' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button type="button" onClick={onClose} style={{ padding: '9px 16px', borderRadius: 10, border: '1px solid var(--hairline)', background: 'var(--field-bg)', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500, transition: 'all 0.2s var(--ease-out)' }}>
              Cancelar
            </button>
            <button type="submit" disabled={submitting || !form.name.trim()} style={{
              padding: '9px 18px', borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.18)',
              background: 'linear-gradient(180deg, #4F8FF7, #2E6BE6)',
              boxShadow: '0 3px 14px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.28)',
              color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              opacity: (submitting || !form.name.trim()) ? 0.5 : 1,
              transition: 'all 0.22s var(--ease-out)',
            }}>
              {submitting ? 'Gravando no Corp...' : 'Cadastrar Cliente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
