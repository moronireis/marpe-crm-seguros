import { useState, useEffect, useRef, useMemo } from 'react';

interface Contact {
  id: string; name: string; phone: string | null; email: string | null;
  tags: string[]; corp_id: string | null; city: string | null;
  photo_url?: string | null;
  last_message?: string | null;
  last_message_direction?: 'inbound' | 'outbound';
  last_message_at?: string;
}

interface Message {
  id: string; contact_id: string; direction: 'inbound' | 'outbound';
  content_type: string; body: string | null; status: string;
  media_url: string | null; media_mime: string | null;
  wa_message_id: string | null;
  is_from_automation: boolean; created_at: string;
  metadata?: { sender_name?: string | null; sender_photo?: string | null; is_group?: boolean } | null;
}

// Resolve the best available URL for a media message.
// Priority: stored media_url → proxy via wa_message_id → null
function resolveMediaUrl(m: Message): string | null {
  if (m.media_url) return m.media_url;
  if (m.wa_message_id) return `/api/media/download?msgid=${encodeURIComponent(m.wa_message_id)}`;
  return null;
}

// WhatsApp-style audio player — Canvas waveform + rAF smooth progress + drag-to-seek
function AudioPlayer({ src, mime, avatarUrl }: { src: string | null; mime: string | null; avatarUrl?: string | null }) {
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0); // 0-1
  const [loadError, setLoadError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const dragging = useRef(false);

  // Deterministic waveform heights from src URL
  const bars = useMemo(() => {
    const n = 52;
    const seed = src || 'x';
    return Array.from({ length: n }, (_, i) => {
      const v = Math.abs(Math.sin(i * 127.1 + seed.charCodeAt(i % seed.length) * 0.031) * 43758.5) % 1;
      const shape = Math.sin((i / n) * Math.PI); // bell curve shape
      return Math.max(0.08, Math.min(1, v * 0.55 + shape * 0.55));
    });
  }, [src]);

  // Draw canvas waveform
  const draw = useRef((prog: number) => {});
  draw.current = (prog: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);

    const n = bars.length;
    const barW = 2.5;
    const gap = (w - n * barW) / (n - 1);
    const cx = prog * w; // playhead x

    for (let i = 0; i < n; i++) {
      const x = i * (barW + gap);
      const barH = Math.round(bars[i] * (h - 6) + 5);
      const y = (h - barH) / 2;
      const filled = x + barW <= cx;
      const atHead = !filled && x <= cx + barW;

      // Filled = accent, head bar = lighter accent, unfilled = muted
      if (filled) {
        ctx.fillStyle = 'rgba(96,165,250,0.9)';
      } else if (atHead && prog > 0) {
        ctx.fillStyle = 'rgba(147,197,253,0.7)';
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
      }

      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, 1.5);
      ctx.fill();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  // rAF loop for smooth progress
  useEffect(() => {
    function tick() {
      const el = audioRef.current;
      if (el && el.duration > 0) {
        const p = el.currentTime / el.duration;
        setProgress(p);
        draw.current(p);
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // Redraw on resize
  useEffect(() => {
    const ro = new ResizeObserver(() => draw.current(progress));
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, [progress]);

  function togglePlay() {
    const el = audioRef.current;
    if (!el || loadError) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      el.play()
        .then(() => setPlaying(true))
        .catch(() => setLoadError(true));
    }
  }

  function seek(clientX: number, rect: DOMRect) {
    const el = audioRef.current;
    if (!el || !el.duration) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    el.currentTime = ratio * el.duration;
    setProgress(ratio);
    draw.current(ratio);
  }

  function fmt(s: number) {
    if (!isFinite(s) || s <= 0) return '0:00';
    const m = Math.floor(s / 60);
    return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
  }

  const elapsed = audioRef.current ? audioRef.current.currentTime : 0;
  const displayTime = playing || progress > 0 ? fmt(elapsed) : (duration > 0 ? fmt(duration) : '0:00');

  if (!src) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 12, fontStyle: 'italic' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
        Áudio indisponível
      </div>
    );
  }

  if (loadError) {
    return (
      <a href={src} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent)', fontSize: 12, textDecoration: 'none' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        Abrir áudio
      </a>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 230, maxWidth: 290, userSelect: 'none' }}>
      {/* Avatar / mic */}
      <div style={{
        width: 40, height: 40, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
        background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.22)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {avatarUrl
          ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(96,165,250,0.8)" strokeWidth="1.8" strokeLinecap="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
        }
      </div>

      {/* Controls */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Play / Pause */}
          <button
            onClick={togglePlay}
            style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0, border: 'none',
              background: playing ? 'rgba(59,130,246,0.85)' : 'var(--accent)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: playing ? '0 0 0 4px rgba(59,130,246,0.18), 0 2px 8px rgba(59,130,246,0.3)' : '0 2px 8px rgba(59,130,246,0.25)',
              transition: 'box-shadow 0.2s, transform 0.1s',
            }}
            onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.92)')}
            onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
          >
            {playing
              ? <svg width="11" height="11" viewBox="0 0 24 24" fill="white"><rect x="5" y="4" width="4" height="16" rx="1"/><rect x="15" y="4" width="4" height="16" rx="1"/></svg>
              : <svg width="11" height="11" viewBox="0 0 24 24" fill="white" style={{ marginLeft: 2 }}><polygon points="5 3 19 12 5 21"/></svg>
            }
          </button>

          {/* Canvas waveform */}
          <canvas
            ref={canvasRef}
            style={{ flex: 1, height: 34, cursor: 'pointer', display: 'block' }}
            onMouseDown={e => {
              dragging.current = true;
              seek(e.clientX, (e.currentTarget as HTMLCanvasElement).getBoundingClientRect());
            }}
            onMouseMove={e => {
              if (!dragging.current) return;
              seek(e.clientX, (e.currentTarget as HTMLCanvasElement).getBoundingClientRect());
            }}
            onMouseUp={() => { dragging.current = false; }}
            onMouseLeave={() => { dragging.current = false; }}
            onTouchStart={e => {
              const touch = e.touches[0];
              seek(touch.clientX, (e.currentTarget as HTMLCanvasElement).getBoundingClientRect());
            }}
            onTouchMove={e => {
              const touch = e.touches[0];
              seek(touch.clientX, (e.currentTarget as HTMLCanvasElement).getBoundingClientRect());
            }}
          />
        </div>

        {/* Time */}
        <div style={{ fontSize: 10, color: 'var(--text-muted)', paddingLeft: 40, letterSpacing: '0.02em' }}>
          {displayTime}
        </div>
      </div>

      <audio
        ref={audioRef}
        preload="metadata"
        onLoadedMetadata={() => { setDuration(audioRef.current?.duration || 0); setLoaded(true); }}
        onEnded={() => { setPlaying(false); setProgress(0); draw.current(0); }}
        onError={() => setLoadError(true)}
        style={{ display: 'none' }}
      >
        <source src={src} type="audio/ogg" />
        <source src={src} type="audio/mpeg" />
        <source src={src} type="audio/mp4" />
        <source src={src} type="audio/ogg; codecs=opus" />
      </audio>
    </div>
  );
}

// Render the correct element based on content_type
function MessageContent({ m }: { m: Message }) {
  const { content_type, body, media_mime } = m;
  const src = resolveMediaUrl(m);

  if (content_type === 'image') {
    return (
      <div>
        {src ? (
          <a href={src} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
            <img
              src={src}
              alt={body || 'Imagem'}
              style={{ maxWidth: 260, width: '100%', borderRadius: 10, display: 'block', cursor: 'pointer', objectFit: 'cover' }}
              onError={e => {
                const img = e.target as HTMLImageElement;
                img.style.display = 'none';
                const fallback = img.nextElementSibling as HTMLElement | null;
                if (fallback) fallback.style.display = 'flex';
              }}
            />
            <div style={{ display: 'none', alignItems: 'center', gap: 6, padding: '6px 0' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              <span style={{ fontSize: 11, color: 'var(--accent)' }}>Ver imagem</span>
            </div>
          </a>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0', color: 'var(--text-muted)', fontSize: 12, fontStyle: 'italic' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            Imagem indisponível
          </div>
        )}
        {body && <div style={{ marginTop: 5, fontSize: 13, lineHeight: 1.4 }}>{body}</div>}
      </div>
    );
  }

  if (content_type === 'audio') {
    return (
      <div>
        <AudioPlayer src={src} mime={media_mime} />
        {body && <div style={{ marginTop: 5, fontSize: 13 }}>{body}</div>}
      </div>
    );
  }

  if (content_type === 'video') {
    return (
      <div>
        {src ? (
          <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', background: '#000', maxWidth: 280 }}>
            <video
              controls
              preload="metadata"
              style={{ width: '100%', display: 'block', maxHeight: 200 }}
              onError={(e) => {
                const el = e.currentTarget;
                el.style.display = 'none';
                const fallback = el.nextElementSibling as HTMLElement | null;
                if (fallback) fallback.style.display = 'flex';
              }}
            >
              <source src={src} type={media_mime || 'video/mp4'} />
            </video>
            <div style={{ display: 'none', padding: '10px 12px', alignItems: 'center', gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              <a href={src} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', fontSize: 12 }}>Abrir vídeo</a>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 12, fontStyle: 'italic' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
            Vídeo indisponível
          </div>
        )}
        {body && <div style={{ marginTop: 5, fontSize: 13 }}>{body}</div>}
      </div>
    );
  }

  if (content_type === 'document') {
    // Try to extract a human-readable filename from the URL or body
    const rawName = src ? decodeURIComponent(src.split('/').pop()?.split('?')[0] || '') : '';
    const filename = body || rawName || 'Documento';
    // Detect PDF for icon variant
    const isPdf = (media_mime || '').includes('pdf') || filename.toLowerCase().endsWith('.pdf');
    return (
      <a
        href={src || '#'}
        target={src ? '_blank' : undefined}
        rel="noopener noreferrer"
        style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', maxWidth: 260 }}
      >
        <div style={{ width: 36, height: 36, borderRadius: 8, background: isPdf ? 'rgba(239,68,68,0.14)' : 'rgba(59,130,246,0.14)', border: `1px solid ${isPdf ? 'rgba(239,68,68,0.25)' : 'rgba(59,130,246,0.25)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {isPdf ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(248,113,113,0.9)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              <line x1="9" y1="15" x2="15" y2="15"/><line x1="9" y1="11" x2="11" y2="11"/>
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(96,165,250,0.9)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
            </svg>
          )}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 500, color: src ? 'var(--accent-light)' : 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {filename}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
            {src ? (isPdf ? 'PDF · Toque para abrir' : 'Documento · Toque para abrir') : 'Documento indisponível'}
          </div>
        </div>
        {src && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" flexShrink="0">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        )}
      </a>
    );
  }

  if (content_type === 'sticker') {
    return (
      <div>
        {src ? (
          <img src={src} alt="Sticker" style={{ maxWidth: 120, maxHeight: 120, display: 'block' }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        ) : (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Sticker</span>
        )}
      </div>
    );
  }

  // Default: plain text
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

function displayName(c: Contact): string {
  // Clean up group JIDs shown as names
  if (c.name && c.name.includes('@g.us')) return 'Grupo ' + c.name.replace('@g.us', '').slice(-8);
  if (c.name && /^\d{10,}$/.test(c.name)) return c.phone || c.name;
  return c.name || c.phone || '—';
}

function getInitials(name: string): string {
  const parts = name.trim().split(' ');
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * Parse a group message body that may have a sender prefix.
 * Format stored by webhook: "[SenderName]: message text"
 * Returns { sender, text } — sender is null if prefix is a JID/numeric ID.
 * JID patterns: digits only, "digits@lid", "digits@s.whatsapp.net"
 */
function parseGroupBody(body: string | null): { sender: string | null; text: string } {
  if (!body) return { sender: null, text: '' };
  const match = body.match(/^\[([^\]]+)\]:\s*([\s\S]*)$/);
  if (!match) return { sender: null, text: body };
  const prefix = match[1];
  const text = match[2];
  // Reject prefixes that look like JIDs or pure numeric IDs
  const isJid = /^[\d]+(@\w+)?$/.test(prefix) || prefix.includes('@');
  if (isJid) return { sender: null, text };
  return { sender: prefix, text };
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
  // CRM panel — editable contact fields
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [savingContact, setSavingContact] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  // Corp sync
  const [corpSyncing, setCorpSyncing] = useState(false);
  const [corpSyncMsg, setCorpSyncMsg] = useState<{ ok: boolean; msg: string } | null>(null);
  // Fix 6: track which contacts have been opened (read) this session
  const [readContactIds, setReadContactIds] = useState<Set<string>>(new Set());

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

  // Auto-select contact from URL query param (?contact=ID)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const contactParam = params.get('contact');
    if (contactParam) {
      setActiveContactId(contactParam);
      // Clean URL without reloading
      const url = new URL(window.location.href);
      url.searchParams.delete('contact');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  }, []);

  // Populate editable fields when active contact changes
  useEffect(() => {
    if (activeContact) {
      setEditName(activeContact.name || '');
      setEditPhone(activeContact.phone || '');
      setEditEmail(activeContact.email || '');
      setEditCity(activeContact.city || '');
      setEditNotes('');
      setSaveSuccess(false);
    }
  }, [activeContactId]);

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

  async function syncCorp() {
    if (!activeContact?.corp_id || corpSyncing) return;
    setCorpSyncing(true);
    setCorpSyncMsg(null);
    try {
      const r = await fetch('/api/corp/sync-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ corp_id: Number(activeContact.corp_id) }),
      });
      const d = await r.json();
      if (d.ok) {
        const { deals: dr } = d.result;
        setCorpSyncMsg({ ok: true, msg: `${dr.created} criados · ${dr.updated} atualizados` });
      } else {
        setCorpSyncMsg({ ok: false, msg: d.error || 'Erro' });
      }
    } catch {
      setCorpSyncMsg({ ok: false, msg: 'Erro de rede' });
    }
    setCorpSyncing(false);
    setTimeout(() => setCorpSyncMsg(null), 5000);
  }

  async function saveContact() {
    if (!activeContactId) return;
    setSavingContact(true);
    setSaveSuccess(false);
    try {
      const res = await fetch(`/api/contacts/${activeContactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName.trim() || undefined,
          phone: editPhone.trim() || undefined,
          email: editEmail.trim() || undefined,
          city: editCity.trim() || undefined,
          notes: editNotes.trim() || undefined,
        }),
      });
      if (res.ok) {
        setSaveSuccess(true);
        // Update local contacts list with new data
        setContacts(prev => prev.map(c => c.id === activeContactId ? {
          ...c,
          name: editName.trim() || c.name,
          phone: editPhone.trim() || c.phone,
          email: editEmail.trim() || c.email,
          city: editCity.trim() || c.city,
        } : c));
        setTimeout(() => setSaveSuccess(false), 2000);
      }
    } catch {}
    setSavingContact(false);
  }

  async function sendMessage() {
    if (!newMsg.trim() || !activeContact?.phone) return;
    setSending(true);
    try {
      // Fix 7: for group contacts, phone is the full JID (e.g. "12345@g.us") — pass as-is
      // The API/send.ts normalizePhone skips group JIDs automatically
      const phoneToSend = activeContact.phone;
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: activeContactId, phone: phoneToSend, text: newMsg }),
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
        <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, flex: 1, letterSpacing: '-0.01em' }}>Inbox</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 99, background: 'var(--green-dim)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }} />
            <span style={{ fontSize: 10.5, color: 'var(--green)', fontWeight: 600 }}>Online</span>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {(['conversas', 'grupos'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{
                flex: 1, padding: '10px 0', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                background: 'transparent', border: 'none', cursor: 'pointer',
                borderBottom: `2px solid ${activeTab === tab ? 'var(--accent)' : 'transparent'}`,
                color: activeTab === tab ? 'var(--accent-light)' : 'var(--text-muted)',
                transition: 'color 0.18s, border-color 0.18s',
                letterSpacing: '0.03em',
              }}>
              {tab === 'conversas' ? 'Conversas' : 'Grupos'}
            </button>
          ))}
        </div>

        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder={activeTab === 'grupos' ? 'Buscar grupo...' : 'Buscar contato, telefone...'}
            style={{ width: '100%', padding: '8px 13px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit', transition: 'border-color 0.18s, box-shadow 0.18s' }}
            onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 0 3px var(--accent-dim)'; }}
            onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
          />
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
            <div key={c.id} onClick={() => {
              setActiveContactId(c.id);
              // Fix 6: mark as read when opened
              setReadContactIds(prev => { const s = new Set(prev); s.add(c.id); return s; });
            }}
              style={{ display: 'flex', gap: 12, padding: '11px 16px', cursor: 'pointer',
                borderLeft: `3px solid ${activeContactId === c.id ? 'var(--accent)' : 'transparent'}`,
                background: activeContactId === c.id ? 'rgba(59,130,246,0.07)' : 'transparent',
                transition: 'background 0.15s, border-color 0.15s' }}
              onMouseEnter={e => { if (activeContactId !== c.id) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)'; }}
              onMouseLeave={e => { if (activeContactId !== c.id) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
            >
              {/* Avatar — photo if available, else initials/group icon */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{ width: 40, height: 40, borderRadius: isGroup ? 10 : '50%', background: isGroup ? 'rgba(6,182,212,0.15)' : '#1e1e30', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: isGroup ? '#22d3ee' : nameColor(c.name), border: isGroup ? '1px solid rgba(6,182,212,0.3)' : 'none', overflow: 'hidden' }}>
                  {c.photo_url
                    ? <img src={c.photo_url} alt={c.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: isGroup ? 10 : '50%' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                    : (isGroup ? 'G' : getInitials(c.name))
                  }
                </div>
                {/* Fix 6: Unread dot — shown when last message is inbound and contact hasn't been opened this session */}
                {c.last_message_direction === 'inbound' && activeContactId !== c.id && !readContactIds.has(c.id) && (
                  <div style={{ position: 'absolute', top: -2, right: -2, width: 10, height: 10, borderRadius: '50%', background: 'var(--accent)', border: '2px solid var(--bg-secondary)', boxSizing: 'content-box' }} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{displayName(c)}</div>
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
          <div style={{ height: 62, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12, flexShrink: 0, background: 'var(--bg-secondary)' }}>
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
            <div style={{ width: 38, height: 38, borderRadius: isGroupContact ? 8 : '50%', background: isGroupContact ? 'rgba(6,182,212,0.15)' : '#1e1e30', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, color: isGroupContact ? '#22d3ee' : nameColor(activeContact.name), border: isGroupContact ? '1px solid rgba(6,182,212,0.3)' : 'none', overflow: 'hidden' }}>
              {activeContact.photo_url
                ? <img src={activeContact.photo_url} alt={activeContact.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: isGroupContact ? 8 : '50%' }} onError={e => { const el = e.currentTarget; el.style.display = 'none'; const parent = el.parentElement; if (parent) parent.dataset.showInitials = 'true'; }} />
                : (isGroupContact ? 'G' : getInitials(activeContact.name))
              }
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{activeContact.name}</div>
              <div style={{ fontSize: 11, color: isGroupContact ? '#22d3ee' : 'var(--text-muted)' }}>
                {isGroupContact ? 'Grupo WhatsApp' : (activeContact.phone || '')}
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

              // For group messages: parse sender prefix from body OR read from metadata
              const metaSender = m.metadata?.sender_name || null;
              const metaPhoto  = m.metadata?.sender_photo || null;
              const { sender: bodySender, text: cleanedText } = isGroupContact && m.content_type === 'text'
                ? parseGroupBody(m.body)
                : { sender: null, text: m.body };
              const groupSender = metaSender || bodySender;

              const displayMsg: Message = (groupSender !== null || (isGroupContact && cleanedText !== m.body))
                ? { ...m, body: cleanedText }
                : m;

              // Avatar for group inbound messages
              const senderPhoto = !isSent && isGroupContact ? metaPhoto : null;
              const senderInitial = groupSender ? groupSender.charAt(0).toUpperCase() : '?';
              const senderColor = groupSender ? nameColor(groupSender) : 'var(--text-muted)';

              return (
                <div key={m.id} style={{
                  display: 'flex', alignItems: 'flex-end', gap: 8,
                  alignSelf: isSent ? 'flex-end' : 'flex-start',
                  maxWidth: '70%',
                  flexDirection: isSent ? 'row-reverse' : 'row',
                }}>
                  {/* Sender avatar — only for inbound group messages */}
                  {isGroupContact && !isSent && (
                    <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', background: '#1e1e30', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: senderColor, alignSelf: 'flex-end', marginBottom: 0 }}>
                      {senderPhoto
                        ? <img src={senderPhoto} alt={groupSender || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                        : senderInitial
                      }
                    </div>
                  )}

                  <div style={{
                    padding: isMediaBubble ? '9px 11px' : '9px 14px',
                    borderRadius: 14, fontSize: 13, lineHeight: 1.55,
                    background: isAuto
                      ? 'rgba(34,197,94,0.07)'
                      : isSent
                        ? 'rgba(59,130,246,0.18)'
                        : 'var(--bg-card)',
                    border: `1px ${isAuto ? 'dashed' : 'solid'} ${
                      isAuto
                        ? 'rgba(34,197,94,0.28)'
                        : isSent
                          ? 'rgba(59,130,246,0.28)'
                          : 'var(--border)'
                    }`,
                    borderBottomRightRadius: isSent ? 4 : 14,
                    borderBottomLeftRadius: isSent ? 14 : 4,
                    minWidth: 0, flex: '0 1 auto',
                    boxShadow: isSent ? '0 2px 8px rgba(59,130,246,0.10)' : 'var(--shadow-xs)',
                  }}>
                    {isAuto && <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Automacao</div>}
                    {/* Sender name inside bubble — only inbound group */}
                    {isGroupContact && !isSent && groupSender && (
                      <div style={{ fontSize: 11, fontWeight: 600, color: senderColor, marginBottom: 3 }}>
                        {groupSender}
                      </div>
                    )}
                    <MessageContent m={displayMsg} />
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, textAlign: 'right' }}>{formatTime(m.created_at)}</div>
                  </div>
                </div>
              );
            })}
            <div ref={msgEndRef} />
          </div>

          {/* Fix 7: groups and individual contacts both get the send area */}
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
                  style={{ flex: 1, padding: '10px 18px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 24, color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit', transition: 'border-color 0.18s, box-shadow 0.18s' }}
                  onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 0 3px var(--accent-dim)'; }}
                  onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
                />
                <button onClick={sendMessage} disabled={sending || !newMsg.trim() || showTemplates}
                  style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: (sending || !newMsg.trim() || showTemplates) ? 0.45 : 1, transition: 'opacity 0.18s, box-shadow 0.18s', boxShadow: (!sending && newMsg.trim()) ? '0 4px 12px rgba(59,130,246,0.35)' : 'none' }}>
                  <svg style={{ width: 16, height: 16, stroke: '#fff', fill: 'none', strokeWidth: 2 }} viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                </button>
              </div>
            </div>
        </div>
      ) : !isMobile ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          {activeTab === 'grupos' ? 'Selecione um grupo para visualizar' : 'Selecione um contato para conversar'}
        </div>
      ) : null}

      {/* CRM Side Panel — hidden on mobile */}
      {activeContact && !isMobile && (
        <div style={{ width: 300, borderLeft: '1px solid var(--border)', background: 'var(--bg-secondary)', flexShrink: 0, overflowY: 'auto', padding: '14px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Dados do Contato</div>
            <a href={`/contato/${activeContact.id}`} style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}>Ver perfil</a>
          </div>

          {/* Editable fields */}
          {([
            ['Nome', editName, setEditName, 'text'],
            ['Telefone', editPhone, setEditPhone, 'tel'],
            ['E-mail', editEmail, setEditEmail, 'email'],
            ['Cidade', editCity, setEditCity, 'text'],
          ] as [string, string, (v: string) => void, string][]).map(([label, value, setter, type]) => (
            <div key={label} style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 3 }}>{label}</label>
              <input
                value={value}
                onChange={e => setter(e.target.value)}
                type={type}
                placeholder={`${label}...`}
                style={{ width: '100%', padding: '7px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
            </div>
          ))}

          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 3 }}>Observacoes</label>
            <textarea
              value={editNotes}
              onChange={e => setEditNotes(e.target.value)}
              placeholder="Notas sobre o contato..."
              rows={3}
              style={{ width: '100%', padding: '7px 10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 12, outline: 'none', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>

          <button
            onClick={saveContact}
            disabled={savingContact}
            style={{ width: '100%', padding: '8px 0', background: saveSuccess ? 'rgba(34,197,94,0.15)' : 'var(--accent)', color: saveSuccess ? '#4ade80' : '#fff', border: saveSuccess ? '1px solid rgba(34,197,94,0.3)' : 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: savingContact ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: savingContact ? 0.6 : 1, transition: 'all 0.2s' }}
          >
            {savingContact ? 'Salvando...' : saveSuccess ? 'Salvo!' : 'Salvar'}
          </button>

          {activeContact.corp_id && (
            <div style={{ marginTop: 12, borderTop: '1px solid rgba(26,26,42,0.3)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Corp ID</span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{activeContact.corp_id}</span>
              </div>
              <button
                onClick={syncCorp}
                disabled={corpSyncing}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '6px 0', borderRadius: 6, fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
                  background: corpSyncing ? 'rgba(59,130,246,0.06)' : 'rgba(59,130,246,0.12)',
                  border: '1px solid rgba(59,130,246,0.25)',
                  color: corpSyncing ? 'var(--text-muted)' : 'var(--accent-light)',
                  cursor: corpSyncing ? 'not-allowed' : 'pointer', width: '100%',
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                  style={{ animation: corpSyncing ? 'spin 1s linear infinite' : 'none' }}>
                  <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
                  <path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
                </svg>
                {corpSyncing ? 'Sincronizando...' : 'Sincronizar Corp'}
              </button>
              {corpSyncMsg && (
                <div style={{
                  fontSize: 10, padding: '5px 8px', borderRadius: 5,
                  background: corpSyncMsg.ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                  border: `1px solid ${corpSyncMsg.ok ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                  color: corpSyncMsg.ok ? '#4ade80' : '#f87171', textAlign: 'center',
                }}>
                  {corpSyncMsg.msg}
                </div>
              )}
            </div>
          )}

          {activeContact.tags && activeContact.tags.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Tags</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {activeContact.tags.map(tag => {
                  const tc = TAG_COLORS[tag] || { bg: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' };
                  return <span key={tag} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: tc.bg, color: tc.color }}>{tag}</span>;
                })}
              </div>
            </div>
          )}

          <div style={{ marginTop: 16, fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Mensagens</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{messages.length} mensagem{messages.length !== 1 ? 's' : ''} no historico</div>
        </div>
      )}
    </div>
  );
}
