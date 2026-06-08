import { useState, useEffect } from 'react';

interface TrackedLink {
  id: string;
  name: string;
  original_url: string;
  slug: string;
  source: string | null;
  click_count: number;
  created_at: string;
}

interface LinkClick {
  id: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
  });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function truncate(url: string, max = 48) {
  return url.length > max ? url.slice(0, max) + '…' : url;
}

function getBaseUrl() {
  return typeof window !== 'undefined' ? window.location.origin : '';
}

// ── Shared style tokens ────────────────────────────────────────────────────
const inp: React.CSSProperties = {
  width: '100%', padding: '9px 12px',
  background: 'var(--bg-secondary)', border: '1px solid var(--border)',
  borderRadius: 8, color: 'var(--text-primary)', fontSize: 13,
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};

function btn(primary?: boolean): React.CSSProperties {
  return {
    padding: '9px 18px', borderRadius: 8,
    border: primary ? 'none' : '1px solid var(--border)',
    background: primary ? 'var(--accent)' : 'transparent',
    color: primary ? '#fff' : 'var(--text-secondary)',
    fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
  };
}

const label: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.06em',
  marginBottom: 6, display: 'block',
};

// ── Copy button ────────────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <button
      onClick={copy}
      title="Copiar URL"
      style={{
        padding: '3px 10px', borderRadius: 6,
        border: '1px solid var(--border)',
        background: copied ? 'rgba(34,197,94,0.12)' : 'transparent',
        color: copied ? 'var(--green)' : 'var(--text-muted)',
        fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
        fontWeight: 500, flexShrink: 0,
        transition: 'color 0.15s, background 0.15s',
        whiteSpace: 'nowrap',
      }}
    >
      {copied ? 'Copiado!' : 'Copiar'}
    </button>
  );
}

// ── Click detail row ───────────────────────────────────────────────────────
function ClicksPanel({ linkId }: { linkId: string }) {
  const [clicks, setClicks] = useState<LinkClick[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/links/${linkId}`)
      .then(r => r.json())
      .then(d => { setClicks(d.clicks || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [linkId]);

  if (loading) {
    return (
      <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>
        Carregando cliques...
      </div>
    );
  }

  if (clicks.length === 0) {
    return (
      <div style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>
        Nenhum clique registrado ainda.
      </div>
    );
  }

  return (
    <div style={{ borderTop: '1px solid var(--border)', overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ background: 'var(--bg-secondary)' }}>
            <th style={{ padding: '6px 16px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>Data/Hora</th>
            <th style={{ padding: '6px 16px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em' }}>IP</th>
            <th style={{ padding: '6px 16px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.05em' }}>User Agent</th>
          </tr>
        </thead>
        <tbody>
          {clicks.map((c, i) => (
            <tr
              key={c.id}
              style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}
            >
              <td style={{ padding: '6px 16px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fmtDateTime(c.created_at)}</td>
              <td style={{ padding: '6px 16px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{c.ip_address || '—'}</td>
              <td style={{ padding: '6px 16px', color: 'var(--text-muted)', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.user_agent ? truncate(c.user_agent, 60) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function LinksView() {
  const [links, setLinks] = useState<TrackedLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', original_url: '', source: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  function load() {
    fetch('/api/links')
      .then(r => r.json())
      .then(d => { setLinks(d.links || []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function createLink() {
    if (!form.name.trim()) { setError('Nome obrigatório'); return; }
    if (!form.original_url.trim()) { setError('URL de destino obrigatória'); return; }

    // Basic URL validation
    try { new URL(form.original_url); } catch {
      setError('URL de destino inválida (inclua https://)');
      return;
    }

    setSaving(true); setError('');
    const res = await fetch('/api/links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name.trim(),
        original_url: form.original_url.trim(),
        source: form.source.trim() || null,
      }),
    });
    const d = await res.json();
    setSaving(false);
    if (!res.ok) { setError(d.error || 'Erro ao criar link'); return; }
    setShowForm(false);
    setForm({ name: '', original_url: '', source: '' });
    load();
  }

  async function deleteLink(id: string, name: string) {
    if (!confirm(`Excluir o link "${name}"? Esta ação não pode ser desfeita.`)) return;
    setDeleting(id);
    await fetch(`/api/links/${id}`, { method: 'DELETE' });
    setDeleting(null);
    setLinks(prev => prev.filter(l => l.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  function toggleExpand(id: string) {
    setExpandedId(prev => prev === id ? null : id);
  }

  const baseUrl = getBaseUrl();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Header */}
      <div style={{
        height: 56, borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', padding: '0 24px', gap: 16, flexShrink: 0,
      }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>Links Rastreados</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {links.length} {links.length === 1 ? 'link' : 'links'}
        </span>
        <button
          onClick={() => { setShowForm(true); setError(''); }}
          style={{ ...btn(true), marginLeft: 'auto' }}
        >
          + Novo link
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

        {/* Create form */}
        {showForm && (
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 12, padding: 20, marginBottom: 20,
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Novo link rastreado</div>

            <div style={{ marginBottom: 10 }}>
              <span style={label}>Nome</span>
              <input
                style={inp}
                placeholder="Ex: WhatsApp Bio — Junho"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div style={{ marginBottom: 10 }}>
              <span style={label}>URL de destino</span>
              <input
                style={inp}
                placeholder="https://wa.me/555199999999"
                value={form.original_url}
                onChange={e => setForm(f => ({ ...f, original_url: e.target.value }))}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <span style={label}>Campanha / Origem <span style={{ fontWeight: 400, opacity: 0.6 }}>(opcional)</span></span>
              <input
                style={inp}
                placeholder="Ex: instagram-bio, google-ads-junho"
                value={form.source}
                onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
              />
            </div>

            {error && (
              <div style={{ fontSize: 12, color: '#f87171', marginBottom: 10 }}>{error}</div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={createLink} disabled={saving} style={btn(true)}>
                {saving ? 'Criando...' : 'Criar link'}
              </button>
              <button
                onClick={() => { setShowForm(false); setError(''); setForm({ name: '', original_url: '', source: '' }); }}
                style={btn()}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Carregando...</div>
        ) : links.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Nenhum link criado. Clique em "+ Novo link" para começar.
          </div>
        ) : (
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: 12, overflow: 'hidden',
          }}>
            {/* Table header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 120px 80px 80px 80px',
              padding: '10px 16px',
              background: 'var(--bg-secondary)',
              borderBottom: '1px solid var(--border)',
              gap: 12,
            }}>
              {['Nome', 'Destino', 'URL curta', 'Campanha', 'Cliques', 'Criado'].map((h, i) => (
                <span key={h} style={{
                  fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  textAlign: i >= 4 ? 'center' : 'left',
                }}>
                  {h}
                </span>
              ))}
            </div>

            {/* Rows */}
            {links.map((link, idx) => {
              const shortUrl = `${baseUrl}/r/${link.slug}`;
              const isExpanded = expandedId === link.id;

              return (
                <div key={link.id} style={{ borderBottom: idx < links.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  {/* Main row */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr 120px 80px 80px 80px',
                      padding: '12px 16px',
                      gap: 12,
                      alignItems: 'center',
                      background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                      cursor: 'pointer',
                      transition: 'background 0.12s',
                    }}
                    onClick={() => toggleExpand(link.id)}
                  >
                    {/* Nome */}
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                        {link.name}
                      </div>
                      {isExpanded && (
                        <button
                          onClick={e => { e.stopPropagation(); deleteLink(link.id, link.name); }}
                          disabled={deleting === link.id}
                          style={{
                            marginTop: 4, fontSize: 11, color: '#f87171',
                            background: 'none', border: 'none', cursor: 'pointer',
                            fontFamily: 'inherit', padding: 0,
                          }}
                        >
                          {deleting === link.id ? 'Excluindo...' : 'Excluir link'}
                        </button>
                      )}
                    </div>

                    {/* URL de destino */}
                    <div
                      style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={link.original_url}
                    >
                      {truncate(link.original_url)}
                    </div>

                    {/* URL curta + copiar */}
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                      onClick={e => e.stopPropagation()}
                    >
                      <span style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        /r/{link.slug}
                      </span>
                      <CopyButton text={shortUrl} />
                    </div>

                    {/* Campanha */}
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {link.source || '—'}
                    </div>

                    {/* Cliques */}
                    <div style={{ textAlign: 'center' }}>
                      <span style={{
                        fontSize: 13, fontWeight: 600,
                        color: link.click_count > 0 ? 'var(--accent)' : 'var(--text-muted)',
                      }}>
                        {link.click_count}
                      </span>
                    </div>

                    {/* Criado */}
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
                      {fmtDate(link.created_at)}
                    </div>
                  </div>

                  {/* Expanded: click details */}
                  {isExpanded && <ClicksPanel linkId={link.id} />}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
