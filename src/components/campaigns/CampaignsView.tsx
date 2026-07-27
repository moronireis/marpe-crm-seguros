import { useState, useEffect } from 'react';
import CampaignWizard from './CampaignWizard';

interface Template { id: string; name: string; body: string; }
interface Campaign {
  id: string; name: string; status: string;
  sent_count: number; delivered_count: number; failed_count: number; read_count: number;
  scheduled_at: string | null; created_at: string;
  segment_filter?: SegmentFilter;
  marpe_templates: { id: string; name: string; body: string } | null;
}

interface SegmentFilter {
  tags?: string[];
  ramo?: string;
  city?: string;
  produtor?: string;
  deal_type?: string;
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft:    { bg: 'rgba(107,114,128,0.12)', color: 'var(--text-muted)' },
  sending:  { bg: 'rgba(245,158,11,0.12)', color: '#fbbf24' },
  sent:     { bg: 'rgba(34,197,94,0.12)',  color: 'var(--green)' },
  failed:   { bg: 'rgba(239,68,68,0.12)',  color: '#f87171' },
};
const STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho', sending: 'Enviando', sent: 'Enviado', failed: 'Erro',
};

const TAG_OPTIONS = ['auto', 'vida', 'residencial', 'empresarial', 'equipamento'];
const RAMO_OPTIONS = ['auto', 'vida', 'residencial', 'empresarial', 'equipamento', 'consorcio', 'financiamento'];
const RAMO_LABELS: Record<string, string> = {
  auto: 'Auto', vida: 'Vida', residencial: 'Residencial', empresarial: 'Empresarial',
  equipamento: 'Equipamento', consorcio: 'Consórcio', financiamento: 'Financiamento',
};
const DEAL_TYPE_OPTIONS = ['prospeccao', 'renovacao', 'resgate', 'venda_cruzada', 'endosso'];
const DEAL_TYPE_LABELS: Record<string, string> = {
  prospeccao: 'Prospecção', renovacao: 'Renovação', resgate: 'Resgate',
  venda_cruzada: 'Venda Cruzada', endosso: 'Endosso',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function hasFilters(f: SegmentFilter) {
  return (f.tags?.length || 0) > 0 || f.ramo || f.city || f.produtor || f.deal_type;
}

function segmentSummary(f: SegmentFilter): string {
  const parts: string[] = [];
  if (f.tags?.length) parts.push(`tags: ${f.tags.join(', ')}`);
  if (f.ramo) parts.push(`ramo: ${RAMO_LABELS[f.ramo] || f.ramo}`);
  if (f.city) parts.push(`cidade: ${f.city}`);
  if (f.produtor) parts.push(`produtor: ${f.produtor}`);
  if (f.deal_type) parts.push(`tipo: ${DEAL_TYPE_LABELS[f.deal_type] || f.deal_type}`);
  return parts.join(' · ');
}

export default function CampaignsView() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', template_id: '' });
  const [segment, setSegment] = useState<SegmentFilter>({});
  const [showSegment, setShowSegment] = useState(false);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [hoveredCampaign, setHoveredCampaign] = useState<string | null>(null);

  function load() {
    Promise.all([
      fetch('/api/campaigns').then(r => r.json()),
      fetch('/api/templates').then(r => r.json()),
    ]).then(([c, t]) => {
      setCampaigns(c.campaigns || []);
      setTemplates(t.templates || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  // Debounced preview count fetch whenever segment changes
  useEffect(() => {
    if (!showForm) return;
    setPreviewCount(null);
    setPreviewLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/campaigns/preview-count', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ segment_filter: segment }),
        });
        const d = await res.json();
        setPreviewCount(res.ok ? d.count : null);
      } catch {
        setPreviewCount(null);
      } finally {
        setPreviewLoading(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [segment, showForm]);

  function toggleTag(tag: string) {
    setSegment(s => {
      const tags = s.tags || [];
      return { ...s, tags: tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag] };
    });
  }

  async function createCampaign() {
    if (!form.name) { setError('Nome obrigatório'); return; }
    setSaving(true); setError('');
    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        template_id: form.template_id || null,
        segment_filter: segment,
      }),
    });
    const d = await res.json();
    setSaving(false);
    if (!res.ok) { setError(d.error || 'Erro'); return; }
    setShowForm(false);
    setForm({ name: '', template_id: '' });
    setSegment({});
    setPreviewCount(null);
    load();
  }

  async function send(id: string) {
    if (!confirm('Disparar esta campanha para todos os contatos correspondentes?')) return;
    setSending(id);
    const res = await fetch(`/api/campaigns/${id}/send`, { method: 'POST' });
    const d = await res.json();
    setSending(null);
    if (!res.ok) { alert(d.error || 'Erro ao disparar'); return; }
    alert(d.message || 'Campanha disparada!');
    load();
  }

  // Styles
  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 12px', background: 'var(--bg-secondary)',
    border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)',
    fontSize: 13, outline: 'none', fontFamily: 'inherit', marginBottom: 10,
    boxSizing: 'border-box',
  };
  const btn = (primary?: boolean): React.CSSProperties => ({
    padding: '9px 18px', borderRadius: 8,
    border: primary ? 'none' : '1px solid var(--border)',
    background: primary ? 'var(--accent)' : 'transparent',
    color: primary ? '#fff' : 'var(--text-secondary)',
    fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
  });
  const label: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, display: 'block',
  };
  const sectionDivider: React.CSSProperties = {
    borderTop: '1px solid var(--border)', margin: '14px 0',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ height: 56, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 24px', gap: 16, flexShrink: 0 }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>Campanhas</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{campaigns.length} campanhas</span>
        <button onClick={() => { setShowForm(true); setShowSegment(false); }} style={{ ...btn(true), marginLeft: 'auto' }}>+ Nova campanha</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

        {/* S5 (27/07): o formulário inline virou o wizard de 4 estágios do PDF
            (Destinatários > Ações > Envio > Resultados). O antigo era um painel
            único, sem tipo de mensagem e sem relatório por destinatário. */}
        {showForm && (
          <CampaignWizard
            templates={templates}
            onClose={() => setShowForm(false)}
            onCreated={load}
          />
        )}

        {/* Campaign list */}
        {loading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Carregando...</div>
        ) : campaigns.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nenhuma campanha. Crie a primeira clicando em "+ Nova campanha".</div>
        ) : campaigns.map(c => {
          const sc = STATUS_COLORS[c.status] || STATUS_COLORS.draft;
          const sf = c.segment_filter || {};
          return (
            <div key={c.id}
              onMouseEnter={() => setHoveredCampaign(c.id)}
              onMouseLeave={() => setHoveredCampaign(null)}
              style={{ background: hoveredCampaign === c.id ? 'var(--bg-card-hover)' : 'var(--bg-card)', border: `1px solid ${hoveredCampaign === c.id ? 'var(--border-accent)' : 'var(--border)'}`, borderRadius: 12, padding: '16px 18px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 14, boxShadow: hoveredCampaign === c.id ? 'var(--shadow-sm)' : 'none', transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{c.name}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 100, background: sc.bg, color: sc.color }}>{STATUS_LABELS[c.status] || c.status}</span>
                </div>
                {c.marpe_templates && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Template: {c.marpe_templates.name}</div>
                )}
                {hasFilters(sf) && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, opacity: 0.8 }}>
                    Segmento: {segmentSummary(sf)}
                  </div>
                )}
                {c.status === 'sent' && (
                  <div style={{ display: 'flex', gap: 14, fontSize: 11 }}>
                    <span><span style={{ color: 'var(--text-muted)' }}>Enviados </span><span style={{ color: 'var(--green)', fontWeight: 600 }}>{c.sent_count || 0}</span></span>
                    <span><span style={{ color: 'var(--text-muted)' }}>Falhas </span><span style={{ color: '#f87171', fontWeight: 600 }}>{c.failed_count || 0}</span></span>
                  </div>
                )}
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>{fmtDate(c.created_at)}</div>
              </div>
              {c.status === 'draft' && (
                <button
                  onClick={() => send(c.id)}
                  disabled={sending === c.id}
                  style={{ ...btn(true), fontSize: 12, padding: '8px 14px', flexShrink: 0 }}
                >
                  {sending === c.id ? 'Disparando...' : '▶ Disparar'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
