import { useState, useEffect, useRef } from 'react';
import TemplateDropdown, { useTemplates, type Template } from '../shared/TemplateDropdown';

interface Message {
  id: string;
  direction: string;
  body: string | null;
  content_type: string;
  created_at: string;
  sent_by: string | null;
  media_url: string | null;
}

interface Props {
  dealId: string;
  contactPhone: string | null;
  contactId: string | null;
  onSendMessage: (text: string) => Promise<void>;
}

export default function DealTabConversas({ dealId, contactPhone, contactId, onSendMessage }: Props) {
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Template picker: "/" prefix opens the dropdown (same UX as the inbox)
  const templates = useTemplates();
  const pickerOpen = text.startsWith('/');

  function selectTemplate(tpl: Template) {
    setText(tpl.body);
    inputRef.current?.focus();
  }

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  function buildUrl() {
    // Query by contact: the WhatsApp thread belongs to the person. Inbound messages
    // arrive by phone number and never carry deal_id, so filtering by deal_id showed
    // an empty conversation on most deals. Fallback to deal_id when contact is missing.
    let url = contactId
      ? `/api/messages?contact_id=${contactId}`
      : `/api/messages?deal_id=${dealId}`;
    if (dateFrom) url += `&date_from=${dateFrom}`;
    if (dateTo) url += `&date_to=${dateTo}`;
    if (search.trim()) url += `&search=${encodeURIComponent(search.trim())}`;
    return url;
  }

  function loadMessages() {
    fetch(buildUrl())
      .then(r => r.json())
      .then(d => {
        setMsgs(d.messages || []);
        setLoading(false);
        setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      })
      .catch(() => setLoading(false));
  }

  useEffect(() => { loadMessages(); }, [dealId, contactId]);

  // Poll every 5s
  useEffect(() => {
    const iv = setInterval(loadMessages, 5000);
    return () => clearInterval(iv);
  }, [dealId, contactId, dateFrom, dateTo, search]);

  // Reload when filters change
  useEffect(() => {
    setLoading(true);
    loadMessages();
  }, [dateFrom, dateTo, search]);

  async function handleSend() {
    if (!text.trim() || sending) return;
    setSending(true);
    await onSendMessage(text);
    setText('');
    setSending(false);
    loadMessages();
  }

  const hasFilters = dateFrom || dateTo || search;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Filter toggle */}
      <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button
          onClick={() => setShowFilters(v => !v)}
          style={{
            fontSize: 10, color: hasFilters ? 'var(--accent-light)' : 'var(--text-muted)',
            background: hasFilters ? 'rgba(59,130,246,0.08)' : 'transparent',
            border: `1px solid ${hasFilters ? 'rgba(59,130,246,0.3)' : 'var(--border)'}`,
            borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Filtros {hasFilters ? '(ativos)' : ''}
        </button>
        {hasFilters && (
          <button
            onClick={() => { setDateFrom(''); setDateTo(''); setSearch(''); }}
            style={{ fontSize: 10, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Limpar
          </button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>
          {msgs.length} msg{msgs.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Filter controls */}
      {showFilters && (
        <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: 8, background: 'var(--bg-secondary)', flexShrink: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>De</span>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ padding: '4px 6px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)', fontSize: 11, outline: 'none', fontFamily: 'inherit' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Até</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ padding: '4px 6px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)', fontSize: 11, outline: 'none', fontFamily: 'inherit' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 120 }}>
            <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Buscar</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar nas mensagens..."
              style={{ padding: '4px 6px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)', fontSize: 11, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }} />
          </div>
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {loading && <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>Carregando...</div>}
        {!loading && msgs.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 24 }}>
            {hasFilters ? 'Nenhuma mensagem encontrada com esses filtros.' : 'Nenhuma conversa com este contato ainda.'}
            {!hasFilters && <><br /><span style={{ fontSize: 11 }}>Envie a primeira mensagem abaixo.</span></>}
          </div>
        )}
        {msgs.map(m => (
          <div key={m.id} style={{ alignSelf: m.direction === 'outbound' ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
            <div style={{
              padding: '8px 12px', borderRadius: 10,
              background: m.direction === 'outbound' ? 'var(--accent-dim)' : 'var(--bg-card)',
              border: `1px solid ${m.direction === 'outbound' ? 'rgba(59,130,246,0.2)' : 'var(--border)'}`,
              borderBottomRightRadius: m.direction === 'outbound' ? 4 : 10,
              borderBottomLeftRadius: m.direction === 'inbound' ? 4 : 10,
            }}>
              {m.content_type === 'image' && m.media_url && (
                <img src={m.media_url} alt="" style={{ maxWidth: '100%', borderRadius: 6, marginBottom: m.body ? 6 : 0 }} loading="lazy" />
              )}
              {m.content_type === 'audio' && m.media_url && (
                <audio controls src={m.media_url} style={{ maxWidth: '100%', marginBottom: m.body ? 6 : 0 }} />
              )}
              {m.content_type === 'document' && m.media_url && (
                <a href={m.media_url} target="_blank" rel="noopener" style={{ fontSize: 11, color: 'var(--accent-light)', display: 'block', marginBottom: m.body ? 6 : 0 }}>
                  Documento anexo
                </a>
              )}
              <div style={{ fontSize: 12, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {m.body || (m.content_type !== 'text' ? `[${m.content_type}]` : '')}
              </div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4, textAlign: 'right' }}>
                {new Date(m.created_at).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Send input */}
      {contactPhone ? (
        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', display: 'flex', gap: 6, flexShrink: 0, position: 'relative' }}>
          <TemplateDropdown
            visible={pickerOpen}
            filter={pickerOpen ? text.slice(1).toLowerCase() : ''}
            templates={templates}
            onSelect={selectTemplate}
          />
          <input
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape' && pickerOpen) { setText(''); return; }
              if (e.key === 'Enter' && !e.shiftKey && !pickerOpen) { e.preventDefault(); handleSend(); }
            }}
            placeholder="Digite / para templates ou mensagem..."
            style={{ flex: 1, padding: '8px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 12, outline: 'none', fontFamily: 'inherit' }}
          />
          <button
            onClick={handleSend}
            disabled={sending || !text.trim() || pickerOpen}
            style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', opacity: (sending || pickerOpen) ? 0.6 : 1 }}
          >
            Enviar
          </button>
        </div>
      ) : (
        <div style={{ padding: 12, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          Contato sem telefone registrado
        </div>
      )}
    </div>
  );
}
