import { useState, useEffect } from 'react';

// Cadastro de Novo Cliente integrado ao Corp: grava no Corp (cliente + telefone +
// endereço + e-mail) e depois no CRM com o vínculo corp_id. Espelha a aba Cadastro
// da tela "Cadastro de Clientes" do Corp. CEP consulta o ViaCEP.

const INPUT_S: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '8px 10px',
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: 8, color: 'var(--text-primary)', fontSize: 13,
  fontFamily: 'inherit', outline: 'none',
};
const LABEL_S: React.CSSProperties = {
  display: 'block', fontSize: 11, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4,
};

interface Profissao { codigo: number; profissao: string; }

interface ContactForm {
  name: string; pessoa: 'F' | 'J'; cpf_cnpj: string; birth_date: string; sexo: string;
  profession: string; phone: string; email: string;
  cep: string; logradouro: string; numero_end: string; complemento: string;
  bairro: string; city: string; state: string; notes: string;
}

const EMPTY: ContactForm = {
  name: '', pessoa: 'F', cpf_cnpj: '', birth_date: '', sexo: '',
  profession: '', phone: '', email: '',
  cep: '', logradouro: '', numero_end: '', complemento: '',
  bairro: '', city: '', state: 'RS', notes: '',
};

export default function NewContactModal({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (contact: any, warnings: string[]) => void;
}) {
  const [form, setForm] = useState<ContactForm>(EMPTY);
  const [profissoes, setProfissoes] = useState<Profissao[]>([]);
  const [cepLoading, setCepLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/corp/lookups')
      .then(r => r.json())
      .then(d => setProfissoes(d.profissoes || []))
      .catch(() => {});
  }, []);

  function field(key: keyof ContactForm) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));
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
        sexo: form.sexo || null,
        profession: form.profession || null,
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
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border)',
        borderRadius: 14, width: 560, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <span style={{ fontSize: 15, fontWeight: 600 }}>Novo Cliente</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 10 }}>grava no Corp e no CRM</span>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontFamily: 'inherit' }}>✕</button>
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
              <label style={LABEL_S}>{form.pessoa === 'J' ? 'CNPJ' : 'CPF'}</label>
              <input value={form.cpf_cnpj} onChange={field('cpf_cnpj')} placeholder={form.pessoa === 'J' ? '00.000.000/0000-00' : '000.000.000-00'} style={INPUT_S} />
            </div>
            <div>
              <label style={LABEL_S}>Nascimento</label>
              <input type="date" value={form.birth_date} onChange={field('birth_date')} style={INPUT_S} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 12 }}>
            <div>
              <label style={LABEL_S}>Sexo</label>
              <select value={form.sexo} onChange={field('sexo')} style={{ ...INPUT_S, cursor: 'pointer' }}>
                <option value="">—</option>
                <option value="M">Masculino</option>
                <option value="F">Feminino</option>
              </select>
            </div>
            <div>
              <label style={LABEL_S}>Profissão</label>
              <select value={form.profession} onChange={field('profession')} style={{ ...INPUT_S, cursor: 'pointer' }}>
                <option value="">— Selecione —</option>
                {profissoes.map(p => <option key={p.codigo} value={p.profissao}>{p.profissao}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={LABEL_S}>Telefone (WhatsApp)</label>
              <input value={form.phone} onChange={field('phone')} placeholder="(55) 99999-9999" style={INPUT_S} />
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
                <input value={form.cep} onChange={e => handleCepChange(e.target.value)} placeholder="00000-000" style={INPUT_S} />
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
            <button type="button" onClick={onClose} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              Cancelar
            </button>
            <button type="submit" disabled={submitting || !form.name.trim()} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', opacity: (submitting || !form.name.trim()) ? 0.5 : 1 }}>
              {submitting ? 'Gravando no Corp...' : 'Cadastrar Cliente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
