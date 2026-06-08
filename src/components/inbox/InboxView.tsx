import { useState, useEffect, useRef } from 'react';

interface Contact {
  id: string; name: string; phone: string | null; email: string | null;
  tags: string[]; corp_id: string | null; city: string | null;
  last_message?: string | null;
  last_message_direction?: 'inbound' | 'outbound';
  last_message_at?: string;
}

interface Message {
  id: string; contact_id: string; direction: 'inbound' | 'outbound';
  content_type: string; body: string | null; status: string;
  media_url: string | null; media_mime: string | null;
  is_from_automation: boolean; created_at: string;
}

// Render the correct element based on content_type
function MessageContent({ m }: { m: Message }) {
  const { content_type, body, media_url, media_mime } = m;

  if (content_type === 'image') {
    return (
      <div>
        {media_url ? (
          <a href={media_url} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
            <img
              src={media_url}
              alt={body || 'Imagem'}
              style={{ maxWidth: 260, width: '100%', borderRadius: 8, display: 'block', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </a>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Imagem indisponível</span>
        )}
        {body && <div style={{ marginTop: 6, fontSize: 13 }}>{body}</div>}
      </div>
    );
  }

  if (content_type === 'audio') {
    return (
      <div>
        {media_url ? (
          <audio controls style={{ width: '100%', maxWidth: 280, height: 36, outline: 'none', display: 'block' }}>
            <source src={media_url} type={media_mime || 'audio/ogg'} />
            <a href={media_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontSize: 12 }}>Ouvir áudio</a>
          </audio>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Áudio indisponível</span>
        )}
        {body && <div style={{ marginTop: 6, fontSize: 13 }}>{body}</div>}
      </div>
    );
  }

  if (content_type === 'video') {
    return (
      <div>
        {media_url ? (
          <video controls style={{ maxWidth: 280, width: '100%', borderRadius: 8, display: 'block', background: '#000' }}>
            <source src={media_url} type={media_mime || 'video/mp4'} />
            <a href={media_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontSize: 12 }}>Abrir vídeo</a>
          </video>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Vídeo indisponível</span>
        )}
        {body && <div style={{ marginTop: 6, fontSize: 13 }}>{body}</div>}
      </div>
    );
  }

  if (content_type === 'document') {
    const filename = body || (media_url ? decodeURIComponent(media_url.split('/').pop() || 'documento') : 'documento');
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 6, background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(96,165,250,0.9)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </div>
        <div style={{ minWidth: 0 }}>
          {media_url ? (
            <a href={media_url} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 13, color: 'var(--accent)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: 200 }}>
              {filename}
            </a>
          ) : (
            <span style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>Documento indisponível</span>
          )}
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>Documento</div>
        </div>
      </div>
    );
  }

  // Default: plain text (also covers 'sticker' as text fallback)
  return <>{body}</>;
}

// Short label for media messages in the contact list preview
function mediaPreviewLabel(contentType: string): string {
  if (contentType === 'image') return 'Imagem';
  if (contentType === 'audio') return 'Audio';
  if (contentType === 'video') return 'Video';
  if (contentType === 'document') return 'Documento';
  if (contentType === 'sticker') return 'Sticker';
  return '';
}

const TAG_COLORS: Record<string, { bg: string; color: string }> = {
  auto: { bg: 'rgba(59,130,246,0.12)', color: '#60A5FA' },
  vida: { bg: 'rgba(139,92,246,0.12)', color: '#a78bfa' },
  residencial: { bg: 'rgba(34,197,94,0.12)', color: '#4ade80' },
  empresarial: { bg: 'rgba(245,158,11,0.12)', color: '#fbbf24' },
  equipamento: { bg: 'rgba(6,182,212,0.12)', color: '#22d3ee' },
};

function getInitials(name: string): string {
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function nameColor(name: string): string {
  const colors = ['#60A5FA', '#4ade80', '#fbbf24', '#a78bfa', '#22d3ee', '#f87171', '#fb923c'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (diff < 172800000) return 'ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export default function InboxView() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'conversas' | 'grupos'>('conversas');
  const [activeContactId, setActiveContactId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [templates, setTemplates] = useState<{ id: string; name: string; shortcut: string | null; category: string | null; body: string }[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateFilter, setTemplateFilter] = useState('');
  const msgEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [waConnected, setWaConnected] = useState<boolean | null>(null);

  // Check WhatsApp connection status
  useEffect(() => {
    const check = () => {
      fetch('/api/admin/whatsapp-status')
        .then(r => r.json())
        .then(d => setWaConnected(d.connected === true))
        .catch(() => setWaConnected(null));
    };
    check();
    const interval = setInterval(check, 15000);
    return () => clearInterval(interval);
  }, []);

  // Detect mobile breakpoint
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Load templates once
  useEffect(() => {
    fetch('/api/templates')
      .then(r => r.json())
      .then(d => setTemplates(d.templates || []))
      .catch(() => {});
  }, []);

  // Load contacts + poll every 10s to catch new contacts from WhatsApp
  useEffect(() => {
    const load = () => {
      const q = search ? `&search=${encodeURIComponent(search)}` : '';
      const sourceParam = activeTab === 'grupos'
        ? '&source=whatsapp_group'
        : '&exclude_source=whatsapp_group';
      fetch(`/api/contacts?limit=50${q}${sourceParam}`)
        .then(r => r.json())
        .then(d => { setContacts(d.contacts || []); setLoadingContacts(false); })
        .catch(() => setLoadingContacts(false));
    };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [search, activeTab]);

  // Load messages for active contact
  useEffect(() => {
    if (!activeContactId) return;
    setLoadingMsgs(true);
    fetch(`/api/messages?contact_id=${activeContactId}`)
      .then(r => r.json())
      .then(d => { setMessages(d.messages || []); setLoadingMsgs(false); })
      .catch(() => setLoadingMsgs(false));
  }, [activeContactId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Poll for new messages every 3s — compares last message ID, not count
  useEffect(() => {
    if (!activeContactId) return;
    const interval = setInterval(() => {
      fetch(`/api/messages?contact_id=${activeContactId}`)
        .then(r => r.json())
        .then(d => {
          const incoming = d.messages || [];
          const lastId = messages[messages.length - 1]?.id;
          const incomingLastId = incoming[incoming.length - 1]?.id;
          if (incomingLastId !== lastId) setMessages(incoming);
        })
        .catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
  }, [activeContactId, messages]);

  // Clear active contact when switching tabs to avoid stale state
  useEffect(() => {
    setActiveContactId(null);
    setMessages([]);
  }, [activeTab]);

  const activeContact = contacts.find(c => c.id === activeContactId);
  const isGroupContact = (activeContact as any)?.source === 'whatsapp_group';

  // Handle input change — detect "/" prefix to show template picker
  function handleMsgChange(value: string) {
    setNewMsg(value);
    if (value.startsWith('/')) {
      setShowTemplates(true);
      setTemplateFilter(value.slice(1).toLowerCase());
    } else {
      setShowTemplates(false);
      setTemplateFilter('');
    }
  }

  // Select a template — replace input with template body
  function selectTemplate(tpl: typeof templates[0]) {
    setNewMsg(tpl.body);
    setShowTemplates(false);
    setTemplateFilter('');
    inputRef.current?.focus();
  }

  // Filter templates by name, shortcut, or category
  const filteredTemplates = templates.filter(t => {
    if (!templateFilter) return true;
    const q = templateFilter.toLowerCase();
    return (t.name.toLowerCase().includes(q)) ||
      (t.shortcut?.toLowerCase().replace('/', '').includes(q)) ||
      (t.category?.toLowerCase().includes(q));
  });

  // Group filtered templates by category
  const CATEGORY_LABELS: Record<string, string> = {
    assistencia: 'Assistência', cobranca: 'Cobrança', comercial: 'Comercial',
    marketing: 'Marketing', 'pos-venda': 'Pós-venda', relacionamento: 'Relacionamento',
    renovacao: 'Renovação', sinistro: 'Sinistro',
  };

  async function sendMessage() {
    if (!newMsg.trim() || !activeContact?.phone) return;
    setSending(true);
    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: activeContactId, phone: activeContact.phone, text: newMsg }),
      });
      setNewMsg('');
      // Refresh messages
      const r = await fetch(`/api/messages?contact_id=${activeContactId}`);
      const d = await r.json();
      setMessages(d.messages || []);
    } catch {}
    setSending(false);
  }

  // On mobile, hide list when a contact is selected (show chat full-width)
  const showList = !isMobile || !activeContactId;
  const showChat = !isMobile || !!activeContactId;

  // WhatsApp disconnected — show full-screen message
  if (waConnected === false) {
    return (
      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 32 }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg style={{ width: 32, height: 32, stroke: '#ef4444', fill: 'none', strokeWidth: 1.5 }} viewBox="0 0 24 24">
            <path d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        </div>
        <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>WhatsApp desconectado</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 360 }}>
          Conecte o WhatsApp em <strong>Configurações → WhatsApp</strong> para enviar e receber mensagens.
        </div>
        <a href="/config" style={{ padding: '10px 20px', borderRadius: 8, background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 500, textDecoration: 'none', marginTop: 8 }}>
          Ir para Configurações
        </a>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Contact List */}
      <div style={{ width: isMobile ? '100%' : 320, borderRight: isMobile ? 'none' : '1px solid var(--border)', display: showList ? 'flex' : 'none', flexDirection: 'column', background: 'var(--bg-secondary)', flexShrink: 0 }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>Inbox</h3>
          <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>Online 24h</span>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {(['conversas', 'grupos'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{
                flex: 1, padding: '9px 0', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                background: 'transparent', border: 'none', cursor: 'pointer',
                borderBottom: `2px solid ${activeTab === tab ? 'var(--accent)' : 'transparent'}`,
                color: activeTab === tab ? 'var(--accent)' : 'var(--text-muted)',
                textTransform: 'capitalize', transition: 'color 0.15s, border-color 0.15s',
                letterSpacing: '0.02em',
              }}>
              {tab === 'conversas' ? 'Conversas' : 'Grupos'}
            </button>
          ))}
        </div>

        <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)' }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder={activeTab === 'grupos' ? 'Buscar grupo...' : 'Buscar contato, telefone...'}
            style={{ width: '100%', padding: '9px 14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingContacts ? (
            <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>Carregando...</div>
          ) : contacts.length === 0 ? (
            <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
              {activeTab === 'grupos' ? 'Nenhum grupo encontrado' : 'Nenhum contato encontrado'}
            </div>
          ) : contacts.map(c => {
            const isGroup = (c as any).source === 'whatsapp_group';
            const preview = c.last_message || '';
            const mediaLabel = mediaPreviewLabel((c as any).last_content_type || '');
            return (
            <div key={c.id} onClick={() => { setActiveContactId(c.id); }}
              style={{ display: 'flex', gap: 12, padding: '12px 16px', cursor: 'pointer',
                borderLeft: `3px solid ${activeContactId === c.id ? 'var(--accent)' : 'transparent'}`,
                background: activeContactId === c.id ? 'rgba(59,130,246,0.06)' : 'transparent', transition: 'all 0.1s' }}>
              {/* Avatar — group gets a teal square badge style */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{ width: 40, height: 40, borderRadius: isGroup ? 10 : '50%', background: isGroup ? 'rgba(6,182,212,0.15)' : '#1e1e30', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: isGroup ? '#22d3ee' : nameColor(c.name), border: isGroup ? '1px solid rgba(6,182,212,0.3)' : 'none' }}>
                  {isGroup ? 'G' : getInitials(c.name)}
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{c.name}</div>
                  {c.last_message_at && <div style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, marginLeft: 6 }}>{formatTime(c.last_message_at)}</div>}
                </div>
                {mediaLabel && !preview ? (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{mediaLabel}</div>
                ) : preview ? (
                  <div style={{ fontSize: 11, color: c.last_message_direction === 'inbound' ? 'var(--text-secondary)' : 'var(--text-muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.last_message_direction === 'outbound' ? '-> ' : ''}{preview}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{c.phone || c.email || '---'}</div>
                )}
              </div>
            </div>
            );
          })}
        </div>
      </div>

      {/* Chat Area */}
      {activeContact && showChat ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
          <div style={{ height: 60, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12, flexShrink: 0 }}>
            {/* Back button — mobile only */}
            {isMobile && (
              <button
                onClick={() => setActiveContactId(null)}
                style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                aria-label="Voltar"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
            )}
            <div style={{ width: 38, height: 38, borderRadius: isGroupContact ? 8 : '50%', background: isGroupContact ? 'rgba(6,182,212,0.15)' : '#1e1e30', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, color: isGroupContact ? '#22d3ee' : nameColor(activeContact.name), border: isGroupContact ? '1px solid rgba(6,182,212,0.3)' : 'none' }}>
              {isGroupContact ? 'G' : getInitials(activeContact.name)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{activeContact.name}</div>
              <div style={{ fontSize: 11, color: isGroupContact ? '#22d3ee' : 'var(--text-muted)' }}>
                {isGroupContact ? 'Grupo -- somente leitura' : (activeContact.phone || '')}
              </div>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {loadingMsgs ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 40 }}>Carregando mensagens...</div>
            ) : messages.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 40 }}>
                {isGroupContact ? 'Nenhuma mensagem do grupo ainda.' : 'Nenhuma mensagem ainda. Envie a primeira!'}
              </div>
            ) : messages.map(m => {
              const isSent = m.direction === 'outbound';
              const isAuto = m.is_from_automation;
              const isMediaBubble = m.content_type !== 'text';
              return (
                <div key={m.id} style={{
                  maxWidth: '65%', padding: isMediaBubble ? '8px 10px' : '10px 14px',
                  borderRadius: 12, fontSize: 13, lineHeight: 1.5,
                  alignSelf: isSent ? 'flex-end' : 'flex-start',
                  background: isAuto ? 'rgba(34,197,94,0.06)' : isSent ? 'var(--accent-dim)' : 'var(--bg-card)',
                  border: `1px ${isAuto ? 'dashed' : 'solid'} ${isAuto ? 'rgba(34,197,94,0.25)' : isSent ? 'rgba(59,130,246,0.2)' : 'var(--border)'}`,
                  borderBottomRightRadius: isSent ? 4 : 12, borderBottomLeftRadius: isSent ? 12 : 4,
                }}>
                  {isAuto && <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Automacao</div>}
                  <MessageContent m={m} />
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, textAlign: 'right' }}>{formatTime(m.created_at)}</div>
                </div>
              );
            })}
            <div ref={msgEndRef} />
          </div>

          {isGroupContact ? (
            <div style={{ borderTop: '1px solid var(--border)', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg style={{ width: 14, height: 14, stroke: 'var(--text-muted)', fill: 'none', strokeWidth: 2, flexShrink: 0 }} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                Grupos sao apenas para visualizacao
              </div>
            </div>
          ) : (
            <div style={{ borderTop: '1px solid var(--border)', padding: '14px 20px', flexShrink: 0, position: 'relative' }}>
              {/* Template picker popup */}
              {showTemplates && filteredTemplates.length > 0 && (
                <div style={{ position: 'absolute', bottom: '100%', left: 16, right: 16, maxHeight: 340, overflowY: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 -4px 24px rgba(0,0,0,0.4)', zIndex: 50, padding: '6px 0' }}>
                  <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border)' }}>
                    Templates {templateFilter && `· "${templateFilter}"`}
                  </div>
                  {(() => {
                    const grouped: Record<string, typeof filteredTemplates> = {};
                    for (const t of filteredTemplates) {
                      const cat = t.category || 'outros';
                      if (!grouped[cat]) grouped[cat] = [];
                      grouped[cat].push(t);
                    }
                    return Object.entries(grouped).map(([cat, items]) => (
                      <div key={cat}>
                        <div style={{ padding: '6px 14px 2px', fontSize: 10, fontWeight: 600, color: 'var(--accent-light)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                          {CATEGORY_LABELS[cat] || cat}
                        </div>
                        {items.map(t => (
                          <div key={t.id} onClick={() => selectTemplate(t)}
                            style={{ padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(59,130,246,0.08)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
                                {t.body.slice(0, 80)}{t.body.length > 80 ? '...' : ''}
                              </div>
                            </div>
                            {t.shortcut && (
                              <span style={{ fontSize: 10, color: 'var(--accent-light)', background: 'rgba(59,130,246,0.1)', padding: '2px 8px', borderRadius: 4, flexShrink: 0, fontFamily: 'monospace' }}>{t.shortcut}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    ));
                  })()}
                </div>
              )}
              {showTemplates && filteredTemplates.length === 0 && templateFilter && (
                <div style={{ position: 'absolute', bottom: '100%', left: 16, right: 16, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 -4px 24px rgba(0,0,0,0.4)', zIndex: 50, padding: '16px 20px', textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Nenhum template encontrado para "/{templateFilter}"</div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input ref={inputRef} value={newMsg} onChange={e => handleMsgChange(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Escape') { setShowTemplates(false); return; }
                    if (e.key === 'Enter' && !e.shiftKey && !showTemplates) { e.preventDefault(); sendMessage(); }
                  }}
                  placeholder="Digite / para templates ou mensagem..." disabled={sending}
                  style={{ flex: 1, padding: '10px 16px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 24, color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
                <button onClick={sendMessage} disabled={sending || !newMsg.trim() || showTemplates}
                  style={{ width: 36, height: 36, borderRadius: '50%', border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: (sending || showTemplates) ? 0.5 : 1 }}>
                  <svg style={{ width: 16, height: 16, stroke: '#fff', fill: 'none', strokeWidth: 2 }} viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                </button>
              </div>
            </div>
          )}
        </div>
      ) : !isMobile ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          {activeTab === 'grupos' ? 'Selecione um grupo para visualizar' : 'Selecione um contato para conversar'}
        </div>
      ) : null}

      {/* CRM Side Panel — hidden on mobile */}
      {activeContact && !isMobile && (
        <div style={{ width: 300, borderLeft: '1px solid var(--border)', background: 'var(--bg-secondary)', flexShrink: 0, overflowY: 'auto', padding: '14px 18px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Dados do Contato</div>
          {[
            ['Nome', activeContact.name],
            ['Telefone', activeContact.phone],
            ['E-mail', activeContact.email],
            ['Cidade', activeContact.city],
            ['Corp ID', activeContact.corp_id],
          ].filter(([, v]) => v).map(([k, v]) => (
            <div key={k as string} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(26,26,42,0.3)' }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{k}</span>
              <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
            </div>
          ))}
          <div style={{ marginTop: 16, fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Mensagens</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{messages.length} mensagem{messages.length !== 1 ? 's' : ''} no historico</div>
        </div>
      )}
    </div>
  );
}
