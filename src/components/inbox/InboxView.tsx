import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import TemplateDropdown, { useTemplates, type Template } from '../shared/TemplateDropdown';
import { maskPhone, validPhone, validEmail } from '../../lib/masks';
import { interpolateVariables } from '../../lib/variables';

interface Contact {
  id: string; name: string; phone: string | null; email: string | null;
  tags: string[]; corp_id: string | null; city: string | null;
  photo_url?: string | null;
  last_message?: string | null;
  last_message_direction?: 'inbound' | 'outbound';
  last_message_at?: string;
  // Sprint S3 (migração 20260717)
  inbox_read_at?: string | null;
  pinned?: boolean;
  conv_status?: string;
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
// Priority: stored media_url (Storage) → proxy via wa_message_id → null
// URLs do CDN do WhatsApp (mmg.whatsapp.net) NÃO servem: expiram e o conteúdo é
// criptografado — nesses casos o proxy self-healing recupera via UazapiGO (fix #21).
function resolveMediaUrl(m: Message): string | null {
  if (m.media_url && !m.media_url.includes('whatsapp.net')) return m.media_url;
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
    // Proxy 410 (expirada na UazapiGO) ou rede — estado terminal, sem link morto (fix #21)
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 12, fontStyle: 'italic' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
        Áudio expirado — peça para reenviar
      </div>
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
          <div>
            <a href={src} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
              <img
                src={src}
                alt={body || 'Imagem'}
                style={{ maxWidth: 260, width: '100%', borderRadius: 10, display: 'block', cursor: 'pointer', objectFit: 'cover' }}
                onError={e => {
                  // Proxy respondeu 410 (mídia expirada na UazapiGO) ou rede falhou —
                  // mostra estado terminal claro em vez de link morto (fix #21)
                  const img = e.target as HTMLImageElement;
                  const anchor = img.parentElement as HTMLElement | null;
                  if (anchor) anchor.style.display = 'none';
                  const fallback = anchor?.nextElementSibling as HTMLElement | null;
                  if (fallback) fallback.style.display = 'flex';
                }}
              />
            </a>
            <div style={{ display: 'none', alignItems: 'center', gap: 6, padding: '6px 0', color: 'var(--text-muted)', fontSize: 12, fontStyle: 'italic' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              Imagem expirada — peça para reenviar
            </div>
          </div>
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
            <div style={{ display: 'none', padding: '10px 12px', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 12, fontStyle: 'italic' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
              Vídeo expirado — peça para reenviar
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

  // Default: texto com a formatação do WhatsApp (S3.9, issue #8)
  return <>{formatWaText(body || '')}</>;
}

// Renderiza a formatação leve do WhatsApp: *negrito*, _itálico_, ~tachado~ e
// ```mono``` (S3.9, issue #8 — antes os marcadores apareciam crus no chat).
function formatWaText(text: string): React.ReactNode {
  if (!text || !/[*_~`]/.test(text)) return text;
  const parts: React.ReactNode[] = [];
  const re = /\*([^*\n]+)\*|_([^_\n]+)_|~([^~\n]+)~|```([\s\S]+?)```/g;
  let last = 0;
  let mIdx = 0;
  for (let match = re.exec(text); match; match = re.exec(text)) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[1] !== undefined) parts.push(<strong key={mIdx++}>{match[1]}</strong>);
    else if (match[2] !== undefined) parts.push(<em key={mIdx++}>{match[2]}</em>);
    else if (match[3] !== undefined) parts.push(<s key={mIdx++}>{match[3]}</s>);
    else if (match[4] !== undefined) parts.push(<code key={mIdx++} style={{ fontSize: '0.92em', background: 'var(--field-bg)', padding: '1px 5px', borderRadius: 5 }}>{match[4]}</code>);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
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
  const templates = useTemplates();
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateFilter, setTemplateFilter] = useState('');
  const msgEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
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
  // Contato aberto via deep-link (?contact=) que pode não estar na 1ª página da
  // lista (limit 50) — mantido à parte para sobreviver ao polling da lista
  const [pinnedContact, setPinnedContact] = useState<Contact | null>(null);

  // ── Sprint S3 (checkpoint 15/07) ──────────────────────────────────────────
  // S3.4 (issue #2): painel Dados do Contato oculto por padrão, preferência local
  const [showContactPanel, setShowContactPanel] = useState(false);
  useEffect(() => { setShowContactPanel(localStorage.getItem('inbox_contact_panel') === '1'); }, []);
  function toggleContactPanel() {
    setShowContactPanel(v => { localStorage.setItem('inbox_contact_panel', v ? '0' : '1'); return !v; });
  }
  // S3.5 (issue #3): filtro Não lidas + S3.8 (issue #4): filtro por etiqueta
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [tagFilter, setTagFilter] = useState('');
  // S3.1-S3.3 (issues #1 #5 #7): anexos, gravação de áudio e colar imagem
  const [attachPreview, setAttachPreview] = useState<{ kind: 'image' | 'video' | 'document' | 'audio'; dataURI: string; mime: string; filename: string; caption: string } | null>(null);
  const [sendingMedia, setSendingMedia] = useState(false);
  const [mediaError, setMediaError] = useState('');
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recDiscardRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputKind = useRef<'document' | 'media'>('media');

  // ── Board 22/07 ───────────────────────────────────────────────────────────
  // #38: arquivos além do primeiro (envio sequencial multi-arquivo)
  const [attachQueue, setAttachQueue] = useState<Array<{ kind: 'image' | 'video' | 'document'; dataURI: string; mime: string; filename: string }>>([]);
  const [mediaProgress, setMediaProgress] = useState('');
  // #30: a API agora devolve a janela mais recente — botão "Carregar anteriores"
  const [hasMoreMsgs, setHasMoreMsgs] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const msgListRef = useRef<HTMLDivElement>(null);
  // #32: encaminhar mensagem para outro contato
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
  // #5: câmera no menu de anexos (mobile abre a câmera via capture)
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Não lida = última msg é inbound E mais recente que a marca de leitura persistida
  // (inbox_read_at — migração 20260717); o Set da sessão dá resposta otimista.
  const isUnread = useCallback((c: any) =>
    c.last_message_direction === 'inbound'
    && (!c.inbox_read_at || (c.last_message_at && c.last_message_at > c.inbox_read_at))
    && !readContactIds.has(c.id), [readContactIds]);

  function markRead(contactId: string) {
    setReadContactIds(prev => { const s = new Set(prev); s.add(contactId); return s; });
    fetch(`/api/contacts/${contactId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inbox_read_at: new Date().toISOString() }),
    }).catch(() => {});
  }

  function patchContactLocal(contactId: string, patch: Record<string, any>) {
    setContacts(prev => prev.map(c => c.id === contactId ? { ...c, ...patch } : c));
    setPinnedContact(prev => prev && prev.id === contactId ? { ...prev, ...patch } as Contact : prev);
  }

  // S3.8: favoritar e finalizar conversa
  async function togglePinContact(c: any) {
    const v = !c.pinned;
    patchContactLocal(c.id, { pinned: v });
    await fetch(`/api/contacts/${c.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned: v }),
    }).catch(() => patchContactLocal(c.id, { pinned: !v }));
  }
  async function toggleConvStatus(c: any) {
    const v = c.conv_status === 'closed' ? 'open' : 'closed';
    patchContactLocal(c.id, { conv_status: v });
    await fetch(`/api/contacts/${c.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conv_status: v }),
    }).catch(() => patchContactLocal(c.id, { conv_status: c.conv_status }));
  }

  // S3.1: arquivo escolhido/colado → preview antes do envio
  function fileToPreview(f: File, forceKind?: 'document') {
    if (f.size > 45 * 1024 * 1024) { setMediaError('Arquivo acima de 45 MB.'); return; }
    const kind = forceKind ? 'document'
      : f.type.startsWith('image/') ? 'image'
      : f.type.startsWith('video/') ? 'video'
      : 'document';
    const reader = new FileReader();
    reader.onload = () => {
      setMediaError('');
      setAttachPreview({ kind, dataURI: String(reader.result), mime: f.type || 'application/octet-stream', filename: f.name, caption: '' });
    };
    reader.readAsDataURL(f);
  }

  // #38: seleção múltipla — o 1º arquivo vira o preview, os demais entram na fila
  // e são enviados em sequência no mesmo clique de Enviar.
  function onFilesPicked(files: FileList | null) {
    const list = Array.from(files || []).slice(0, 10);
    if (list.length === 0) return;
    const forceKind = fileInputKind.current === 'document' ? 'document' as const : undefined;
    fileToPreview(list[0], forceKind);
    const rest = list.slice(1).filter(f => f.size <= 45 * 1024 * 1024);
    if (rest.length < list.length - 1) setMediaError('Arquivos acima de 45 MB foram ignorados.');
    Promise.all(rest.map(f => new Promise<{ kind: 'image' | 'video' | 'document'; dataURI: string; mime: string; filename: string }>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve({
        kind: forceKind || (f.type.startsWith('image/') ? 'image' : f.type.startsWith('video/') ? 'video' : 'document'),
        dataURI: String(reader.result),
        mime: f.type || 'application/octet-stream',
        filename: f.name,
      });
      reader.readAsDataURL(f);
    }))).then(items => setAttachQueue(items));
  }

  // S3.2: gravação de áudio (MediaRecorder → UazapiGO transcodifica p/ voz)
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      recChunksRef.current = [];
      recDiscardRef.current = false;
      mr.ondataavailable = e => { if (e.data.size > 0) recChunksRef.current.push(e.data); };
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        if (recDiscardRef.current) return;
        const blob = new Blob(recChunksRef.current, { type: mr.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => setAttachPreview({ kind: 'audio', dataURI: String(reader.result), mime: blob.type, filename: 'audio.webm', caption: '' });
        reader.readAsDataURL(blob);
      };
      mr.start();
      mediaRecRef.current = mr;
      setRecording(true);
      setRecordSecs(0);
      recTimerRef.current = setInterval(() => setRecordSecs(s => s + 1), 1000);
    } catch {
      setMediaError('Microfone indisponível — verifique a permissão do navegador.');
    }
  }
  function stopRecording(discard: boolean) {
    recDiscardRef.current = discard;
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    setRecording(false);
    mediaRecRef.current?.stop();
    mediaRecRef.current = null;
  }

  // #35: a legenda agora é o texto do composer principal (campo único);
  // #38: envia o preview + a fila em sequência; #31: devolve o foco ao composer.
  async function sendMedia() {
    if (!attachPreview || !activeContact || sendingMedia) return;
    setSendingMedia(true);
    setMediaError('');
    const items = [attachPreview, ...attachQueue];
    const caption = newMsg.trim();
    let failed = 0;
    for (let i = 0; i < items.length; i++) {
      if (items.length > 1) setMediaProgress(`Enviando ${i + 1}/${items.length}…`);
      try {
        const res = await fetch('/api/messages/media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contact_id: activeContact.id,
            phone: activeContact.phone,
            kind: items[i].kind,
            data: items[i].dataURI,
            filename: items[i].filename,
            // legenda só no primeiro arquivo (mesmo comportamento do WhatsApp)
            caption: i === 0 && caption && items[i].kind !== 'audio' ? caption : undefined,
          }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) { failed++; setMediaError(d.error || 'Falha no envio da mídia.'); }
      } catch {
        failed++;
        setMediaError('Erro de rede ao enviar a mídia.');
      }
    }
    setMediaProgress('');
    if (failed === 0) {
      setAttachPreview(null);
      setAttachQueue([]);
      if (caption) { setNewMsg(''); if (inputRef.current) inputRef.current.style.height = 'auto'; }
      try {
        const r = await fetch(`/api/messages?contact_id=${activeContact.id}`);
        const md = await r.json();
        setMessages(md.messages || []);
        setHasMoreMsgs(!!md.has_more);
      } catch {}
    }
    setSendingMedia(false);
    inputRef.current?.focus();
  }

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
    setHasMoreMsgs(false);
    fetch(`/api/messages?contact_id=${activeContactId}`)
      .then(r => r.json())
      .then(d => { setMessages(d.messages || []); setHasMoreMsgs(!!d.has_more); setLoadingMsgs(false); })
      .catch(() => setLoadingMsgs(false));
  }, [activeContactId]);

  // #30: carrega a janela anterior de mensagens preservando a posição do scroll
  async function loadOlderMessages() {
    if (!activeContactId || loadingOlder || messages.length === 0) return;
    setLoadingOlder(true);
    try {
      const r = await fetch(`/api/messages?contact_id=${activeContactId}&before=${encodeURIComponent(messages[0].created_at)}`);
      const d = await r.json();
      const older: Message[] = d.messages || [];
      const list = msgListRef.current;
      const prevHeight = list?.scrollHeight || 0;
      setMessages(prev => [...older, ...prev]);
      setHasMoreMsgs(!!d.has_more);
      requestAnimationFrame(() => {
        if (list) list.scrollTop = list.scrollHeight - prevHeight + list.scrollTop;
      });
    } catch {}
    setLoadingOlder(false);
  }

  // Scroll to bottom on new messages — só quando a ÚLTIMA mensagem muda
  // (#30: prepend de "Carregar anteriores" não pode jogar o scroll para o fim)
  const lastMsgId = messages[messages.length - 1]?.id;
  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lastMsgId]);

  // Poll for new messages every 3s — compares last message ID, not count.
  // #30: mescla apenas as mensagens NOVAS no fim, preservando janelas antigas
  // carregadas via "Carregar anteriores".
  useEffect(() => {
    if (!activeContactId) return;
    const interval = setInterval(() => {
      fetch(`/api/messages?contact_id=${activeContactId}`)
        .then(r => r.json())
        .then(d => {
          const incoming: Message[] = d.messages || [];
          if (incoming.length === 0) return;
          setMessages(prev => {
            const prevLastId = prev[prev.length - 1]?.id;
            if (incoming[incoming.length - 1]?.id === prevLastId) return prev;
            if (prev.length === 0) return incoming;
            const known = new Set(prev.map(m => m.id));
            const fresh = incoming.filter(m => !known.has(m.id));
            return fresh.length ? [...prev, ...fresh] : prev;
          });
        })
        .catch(() => {});
    }, 3000);
    return () => clearInterval(interval);
  }, [activeContactId]);

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
      // Checkpoint 10/07 item 3: o contato pode não estar entre os 50 da lista —
      // busca direto e "pina" para o chat abrir mesmo assim
      fetch(`/api/contacts/${contactParam}`)
        .then(r => r.json())
        .then(d => { if (d.contact) setPinnedContact(d.contact); })
        .catch(() => {});
      // Clean URL without reloading
      const url = new URL(window.location.href);
      url.searchParams.delete('contact');
      window.history.replaceState({}, '', url.pathname + url.search);
    }
  }, []);

  const activeContact =
    contacts.find(c => c.id === activeContactId) ||
    (pinnedContact && pinnedContact.id === activeContactId ? pinnedContact : undefined);
  const isGroupContact = (activeContact as any)?.source === 'whatsapp_group';

  // S3.9 (issue #8): "@556299999999" → "@Nome" quando o número bate com um contato
  // carregado (compara pelos últimos 8 dígitos — cobre variações de 9º dígito/DDI)
  const resolveMentions = useCallback((text: string) => {
    if (!text.includes('@')) return text;
    return text.replace(/@(\d{10,15})/g, (full, num: string) => {
      const tail = num.slice(-8);
      const match = contacts.find(ct => (ct.phone || '').replace(/\D/g, '').endsWith(tail));
      return match ? `@${match.name}` : full;
    });
  }, [contacts]);

  // S3.5/S3.8: lista com filtros (Não lidas, etiqueta) e favoritas no topo
  const unreadCount = useMemo(() => contacts.reduce((n, c) => n + (isUnread(c) ? 1 : 0), 0), [contacts, isUnread]);
  const allTags = useMemo(() =>
    [...new Set(contacts.flatMap(c => c.tags || []))].sort(), [contacts]);
  const listContacts = useMemo(() => {
    let list = contacts;
    if (onlyUnread) list = list.filter(isUnread);
    if (tagFilter) list = list.filter(c => (c.tags || []).includes(tagFilter));
    return [...list].sort((a, b) => ((b as any).pinned ? 1 : 0) - ((a as any).pinned ? 1 : 0));
  }, [contacts, onlyUnread, tagFilter, isUnread]);

  // Populate editable fields when active contact changes
  // (activeContact?.id no deps: cobre o caso do contato pinado chegar depois via fetch)
  useEffect(() => {
    if (activeContact) {
      setEditName(activeContact.name || '');
      setEditPhone(activeContact.phone || '');
      setEditEmail(activeContact.email || '');
      setEditCity(activeContact.city || '');
      setEditNotes('');
      setSaveSuccess(false);
    }
  }, [activeContactId, activeContact?.id]);

  // Composer expansível (checkpoint 10/07, item 5)
  function resizeComposer() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 132) + 'px';
  }

  // Handle input change — detect "/" prefix to show template picker
  function handleMsgChange(value: string) {
    setNewMsg(value);
    resizeComposer();
    if (value.startsWith('/')) {
      setShowTemplates(true);
      setTemplateFilter(value.slice(1).toLowerCase());
    } else {
      setShowTemplates(false);
      setTemplateFilter('');
    }
  }

  // Select a template — replace input with template body
  function selectTemplate(tpl: Template) {
    setNewMsg(tpl.body);
    setShowTemplates(false);
    setTemplateFilter('');
    inputRef.current?.focus();
    requestAnimationFrame(resizeComposer);
  }

  const composerHasVars = /\{\{\w+\}\}/.test(newMsg);

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
    if (!validPhone(editPhone) || !validEmail(editEmail)) return; // borda vermelha já indica o campo
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
    // #35: com anexo em preview, o botão/Enter enviam a mídia (o texto vira legenda)
    if (attachPreview) { await sendMedia(); return; }
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
      if (inputRef.current) inputRef.current.style.height = 'auto';
      // Refresh messages
      const r = await fetch(`/api/messages?contact_id=${activeContactId}`);
      const d = await r.json();
      setMessages(d.messages || []);
      setHasMoreMsgs(!!d.has_more);
    } catch {}
    setSending(false);
    // #31: sem o refocus, cada envio exigia novo clique na área de texto
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  // On mobile, hide list when a contact is selected (show chat full-width)
  const showList = !isMobile || !activeContactId;
  const showChat = !isMobile || !!activeContactId;

  // WhatsApp disconnected — show full-screen message
  if (waConnected === false) {
    return (
      <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <div className="glass-modal modal-pop" style={{ borderRadius: 'var(--radius-xl)', padding: '40px 44px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, maxWidth: 440 }}>
          <div style={{ width: 64, height: 64, borderRadius: 20, background: 'var(--red-dim)', border: '1px solid rgba(239,68,68,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg style={{ width: 30, height: 30, stroke: 'var(--red)', fill: 'none', strokeWidth: 1.5 }} viewBox="0 0 24 24">
              <path d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>WhatsApp desconectado</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 360 }}>
            Conecte o WhatsApp em <strong>Configurações → WhatsApp</strong> para enviar e receber mensagens.
          </div>
          <a href="/config" style={{ padding: '10px 22px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.18)', background: 'linear-gradient(180deg, #4F8FF7, #2E6BE6)', boxShadow: '0 3px 14px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.28)', color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none', marginTop: 8, transition: 'all 0.22s var(--ease-out)' }}>
            Ir para Configurações
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', gap: 12, padding: isMobile ? 8 : '12px 16px 16px' }}>
      {/* Contact List */}
      <div className="glass-panel anim" style={{ ['--i' as any]: 0, width: isMobile ? '100%' : 320, borderRadius: 'var(--radius-lg)', display: showList ? 'flex' : 'none', flexDirection: 'column', flexShrink: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, flex: 1, letterSpacing: '-0.01em' }}>Inbox</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 99, background: 'var(--green-dim)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }} />
            <span style={{ fontSize: 10.5, color: 'var(--green)', fontWeight: 600 }}>Online</span>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--hairline)', flexShrink: 0 }}>
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
          {/* S3.5 (issue #3): filtro Não lidas */}
          <button onClick={() => setOnlyUnread(v => !v)}
            style={{
              flex: 1, padding: '10px 0', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
              background: 'transparent', border: 'none', cursor: 'pointer',
              borderBottom: `2px solid ${onlyUnread ? 'var(--accent)' : 'transparent'}`,
              color: onlyUnread ? 'var(--accent-light)' : 'var(--text-muted)',
              transition: 'color 0.18s, border-color 0.18s', letterSpacing: '0.03em',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            }}>
            Não lidas
            {unreadCount > 0 && (
              <span style={{ fontSize: 9.5, fontWeight: 700, background: 'var(--accent)', color: '#fff', borderRadius: 999, padding: '1px 6px', lineHeight: 1.5 }}>{unreadCount}</span>
            )}
          </button>
        </div>

        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--hairline)' }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder={activeTab === 'grupos' ? 'Buscar grupo...' : 'Buscar contato, telefone...'}
            style={{ width: '100%', padding: '8px 14px', background: 'var(--field-bg)', border: '1px solid var(--hairline)', borderRadius: 999, color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit', transition: 'border-color 0.18s, box-shadow 0.18s', boxSizing: 'border-box' }}
            onFocus={e => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 0 3px var(--accent-dim)'; }}
            onBlur={e => { e.target.style.borderColor = 'var(--hairline)'; e.target.style.boxShadow = 'none'; }}
          />
          {/* S3.8: filtro por etiqueta */}
          {allTags.length > 0 && (
            <select value={tagFilter} onChange={e => setTagFilter(e.target.value)}
              style={{ width: '100%', marginTop: 6, padding: '6px 12px', background: 'var(--field-bg)', border: `1px solid ${tagFilter ? 'rgba(59,130,246,0.5)' : 'var(--hairline)'}`, borderRadius: 999, color: tagFilter ? 'var(--accent-light)' : 'var(--text-muted)', fontSize: 11.5, outline: 'none', fontFamily: 'inherit', cursor: 'pointer', boxSizing: 'border-box' }}>
              <option value="">Todas as etiquetas</option>
              {allTags.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
          {loadingContacts ? (
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[0, 1, 2, 3, 4].map(i => (
                <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div className="skeleton" style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div className="skeleton" style={{ height: 12, width: '60%', marginBottom: 6 }} />
                    <div className="skeleton" style={{ height: 10, width: '85%' }} />
                  </div>
                </div>
              ))}
            </div>
          ) : listContacts.length === 0 ? (
            <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>
              {onlyUnread ? 'Nenhuma conversa não lida' : activeTab === 'grupos' ? 'Nenhum grupo encontrado' : 'Nenhum contato encontrado'}
            </div>
          ) : listContacts.map(c => {
            const isGroup = (c as any).source === 'whatsapp_group';
            const preview = c.last_message || '';
            const mediaLabel = mediaPreviewLabel((c as any).last_content_type || '');
            return (
            <div key={c.id} onClick={() => {
              setActiveContactId(c.id);
              // S3.5: marca leitura persistida (inbox_read_at) + sessão
              markRead(c.id);
            }}
              style={{ display: 'flex', gap: 12, padding: '10px 10px', cursor: 'pointer',
                borderRadius: 12, marginBottom: 2,
                border: `1px solid ${activeContactId === c.id ? 'var(--hairline)' : 'transparent'}`,
                background: activeContactId === c.id ? 'var(--accent-dim)' : 'transparent',
                boxShadow: activeContactId === c.id ? 'inset 0 1px 0 var(--highlight)' : 'none',
                transition: 'background 0.18s var(--ease-out), border-color 0.18s var(--ease-out)' }}
              onMouseEnter={e => { if (activeContactId !== c.id) (e.currentTarget as HTMLDivElement).style.background = 'var(--field-bg)'; }}
              onMouseLeave={e => { if (activeContactId !== c.id) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
            >
              {/* Avatar — photo if available, else initials/group icon */}
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <div style={{ width: 40, height: 40, borderRadius: isGroup ? 10 : '50%', background: isGroup ? 'rgba(6,182,212,0.15)' : 'var(--field-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: isGroup ? '#22d3ee' : nameColor(c.name), border: isGroup ? '1px solid rgba(6,182,212,0.3)' : 'none', overflow: 'hidden' }}>
                  {c.photo_url
                    ? <img src={c.photo_url} alt={c.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: isGroup ? 10 : '50%' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                    : (isGroup ? 'G' : getInitials(c.name))
                  }
                </div>
                {/* S3.5: bolinha de não lida — modelo persistido (inbox_read_at) */}
                {isUnread(c) && activeContactId !== c.id && (
                  <div style={{ position: 'absolute', top: -2, right: -2, width: 10, height: 10, borderRadius: '50%', background: 'var(--accent)', border: '2px solid var(--bg-primary)', boxShadow: '0 0 8px var(--accent-glow)', boxSizing: 'content-box' }} />
                )}
                {/* S3.8: favorita */}
                {(c as any).pinned && (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="var(--accent)" stroke="none" style={{ position: 'absolute', bottom: -2, right: -2 }}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
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
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <div className="glass-nav anim" style={{ ['--i' as any]: 1, height: 62, borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12, flexShrink: 0 }}>
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
            <div style={{ width: 38, height: 38, borderRadius: isGroupContact ? 8 : '50%', background: isGroupContact ? 'rgba(6,182,212,0.15)' : 'var(--field-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, color: isGroupContact ? '#22d3ee' : nameColor(activeContact.name), border: isGroupContact ? '1px solid rgba(6,182,212,0.3)' : 'none', overflow: 'hidden' }}>
              {activeContact.photo_url
                ? <img src={activeContact.photo_url} alt={activeContact.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: isGroupContact ? 8 : '50%' }} onError={e => { const el = e.currentTarget; el.style.display = 'none'; const parent = el.parentElement; if (parent) parent.dataset.showInitials = 'true'; }} />
                : (isGroupContact ? 'G' : getInitials(activeContact.name))
              }
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{activeContact.name}</span>
                {(activeContact as any).conv_status === 'closed' && (
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--green)', background: 'var(--green-dim)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 999, padding: '2px 8px', flexShrink: 0 }}>Finalizada</span>
                )}
              </div>
              <div style={{ fontSize: 11, color: isGroupContact ? '#22d3ee' : 'var(--text-muted)' }}>
                {isGroupContact ? 'Grupo WhatsApp' : (activeContact.phone || '')}
              </div>
            </div>
            {/* S3.8 (issue #4): favoritar + finalizar · S3.4 (issue #2): mostrar dados */}
            {!isGroupContact && (
              <button onClick={() => togglePinContact(activeContact)} title={(activeContact as any).pinned ? 'Desafixar conversa' : 'Favoritar conversa'}
                style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid var(--hairline)', background: (activeContact as any).pinned ? 'var(--accent-dim)' : 'var(--field-bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.18s var(--ease-out)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill={(activeContact as any).pinned ? 'var(--accent)' : 'none'} stroke={(activeContact as any).pinned ? 'var(--accent)' : 'var(--text-muted)'} strokeWidth="1.8" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              </button>
            )}
            {!isGroupContact && (
              <button onClick={() => toggleConvStatus(activeContact)} title={(activeContact as any).conv_status === 'closed' ? 'Reabrir conversa' : 'Finalizar conversa'}
                style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid var(--hairline)', background: (activeContact as any).conv_status === 'closed' ? 'var(--green-dim)' : 'var(--field-bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.18s var(--ease-out)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={(activeContact as any).conv_status === 'closed' ? 'var(--green)' : 'var(--text-muted)'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
              </button>
            )}
            {!isMobile && (
              <button onClick={toggleContactPanel} title={showContactPanel ? 'Ocultar dados do contato' : 'Ver dados do contato'}
                style={{ height: 32, padding: '0 12px', borderRadius: 9, border: `1px solid ${showContactPanel ? 'rgba(59,130,246,0.4)' : 'var(--hairline)'}`, background: showContactPanel ? 'var(--accent-dim)' : 'var(--field-bg)', color: showContactPanel ? 'var(--accent-light)' : 'var(--text-secondary)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, fontFamily: 'inherit', transition: 'all 0.18s var(--ease-out)' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                Dados
              </button>
            )}
          </div>

          <div ref={msgListRef} className="glass-panel anim" style={{ ['--i' as any]: 2, flex: 1, borderRadius: 'var(--radius-lg)', overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* #30: a conversa abre na janela mais recente — botão puxa as anteriores */}
            {!loadingMsgs && hasMoreMsgs && (
              <button onClick={loadOlderMessages} disabled={loadingOlder}
                style={{ alignSelf: 'center', padding: '6px 16px', borderRadius: 999, border: '1px solid var(--hairline)', background: 'var(--field-bg)', color: 'var(--text-secondary)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, opacity: loadingOlder ? 0.6 : 1 }}>
                {loadingOlder ? 'Carregando…' : 'Carregar mensagens anteriores'}
              </button>
            )}
            {loadingMsgs ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 8 }}>
                <div className="skeleton" style={{ height: 44, width: '46%', borderRadius: 14, alignSelf: 'flex-start' }} />
                <div className="skeleton" style={{ height: 44, width: '52%', borderRadius: 14, alignSelf: 'flex-end' }} />
                <div className="skeleton" style={{ height: 34, width: '38%', borderRadius: 14, alignSelf: 'flex-start' }} />
                <div className="skeleton" style={{ height: 52, width: '48%', borderRadius: 14, alignSelf: 'flex-end' }} />
              </div>
            ) : messages.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 40 }}>
                {isGroupContact ? 'Nenhuma mensagem do grupo ainda.' : 'Nenhuma mensagem ainda. Envie a primeira!'}
              </div>
            ) : messages.map(m => {
              const isSent = m.direction === 'outbound';
              const isAuto = m.is_from_automation;
              const isMediaBubble = m.content_type !== 'text';

              // For group messages: parse sender prefix from body OR read from metadata.
              // S3.6 (issue #6): o parse vale para TODOS os tipos — em mídia, o prefixo
              // "[Remetente]" vazava como legenda visível sob a imagem.
              const metaSender = m.metadata?.sender_name || null;
              const metaPhoto  = m.metadata?.sender_photo || null;
              const { sender: bodySender, text: cleanedText } = isGroupContact && m.body
                ? parseGroupBody(m.body)
                : { sender: null, text: m.body };
              const groupSender = metaSender || bodySender;

              // S3.9 (issue #8): resolve menções @<número> para o nome do contato
              const resolvedBody = cleanedText ? resolveMentions(cleanedText) : cleanedText;
              const displayMsg: Message = (groupSender !== null || resolvedBody !== m.body)
                ? { ...m, body: resolvedBody }
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
                    <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', background: 'var(--field-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: senderColor, alignSelf: 'flex-end', marginBottom: 0 }}>
                      {senderPhoto
                        ? <img src={senderPhoto} alt={groupSender || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                        : senderInitial
                      }
                    </div>
                  )}

                  <div style={{
                    padding: isMediaBubble ? '9px 11px' : '9px 14px',
                    borderRadius: 16, fontSize: 13, lineHeight: 1.55,
                    background: isAuto
                      ? 'var(--green-dim)'
                      : isSent
                        ? 'var(--msg-out-bg)'
                        : 'var(--msg-in-bg)',
                    border: `1px ${isAuto ? 'dashed' : 'solid'} ${
                      isAuto
                        ? 'rgba(34,197,94,0.28)'
                        : 'var(--hairline)'
                    }`,
                    borderBottomRightRadius: isSent ? 4 : 16,
                    borderBottomLeftRadius: isSent ? 16 : 4,
                    minWidth: 0, flex: '0 1 auto',
                    boxShadow: isSent ? '0 2px 10px rgba(59,130,246,0.12), inset 0 1px 0 var(--highlight)' : 'var(--shadow-xs)',
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
                  {/* #32: encaminhar mensagem para outro contato */}
                  <button onClick={() => setForwardMsg(m)} title="Encaminhar"
                    style={{ width: 26, height: 26, borderRadius: '50%', border: '1px solid var(--hairline)', background: 'var(--field-bg)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: 0.35, transition: 'opacity 0.15s var(--ease-out)', alignSelf: 'center' }}
                    onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={e => (e.currentTarget.style.opacity = '0.35')}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>
                  </button>
                </div>
              );
            })}
            <div ref={msgEndRef} />
          </div>

          {/* Fix 7: groups and individual contacts both get the send area — barra flutuante de vidro */}
          <div className="glass-nav anim" style={{ ['--i' as any]: 3, borderRadius: 24, padding: '8px 8px 8px 18px', flexShrink: 0, position: 'relative' }}>
              {/* Template picker popup */}
              <TemplateDropdown
                visible={showTemplates}
                filter={templateFilter}
                templates={templates}
                onSelect={selectTemplate}
                left={16}
                right={16}
              />
              {/* Preview de variáveis (item 5) — some quando o picker "/" está aberto */}
              {composerHasVars && !showTemplates && (
                <div className="glass-modal fade-in" style={{ position: 'absolute', bottom: 'calc(100% + 10px)', left: 16, right: 16, zIndex: 40, borderRadius: 14, padding: '9px 13px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--accent-light)', display: 'block', marginBottom: 3 }}>Preview da mensagem</span>
                  {interpolateVariables(newMsg, { contact: activeContact })}
                </div>
              )}
              {/* S3.1 (issues #1 #5): preview do anexo antes do envio */}
              {attachPreview && (
                <div className="glass-modal fade-in" style={{ position: 'absolute', bottom: 'calc(100% + 10px)', left: 16, right: 16, zIndex: 70, borderRadius: 14, padding: 12 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    {attachPreview.kind === 'image' && <img src={attachPreview.dataURI} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10, flexShrink: 0 }} />}
                    {attachPreview.kind === 'video' && <video src={attachPreview.dataURI} style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10, flexShrink: 0 }} />}
                    {attachPreview.kind === 'audio' && (
                      <div style={{ width: 64, height: 64, borderRadius: 10, background: 'var(--accent-dim)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, flexShrink: 0 }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>
                        <audio src={attachPreview.dataURI} controls style={{ display: 'none' }} />
                      </div>
                    )}
                    {attachPreview.kind === 'document' && (
                      <div style={{ width: 64, height: 64, borderRadius: 10, background: 'var(--field-bg)', border: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {attachPreview.kind === 'audio' ? 'Mensagem de voz' : attachPreview.filename}
                      </div>
                      {/* #38: fila multi-arquivo · #35: legenda foi para o composer (campo único) */}
                      {attachQueue.length > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                          + {attachQueue.length} outro{attachQueue.length > 1 ? 's' : ''} arquivo{attachQueue.length > 1 ? 's' : ''}
                        </div>
                      )}
                      {attachPreview.kind !== 'audio' && (
                        <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 3 }}>
                          O texto digitado abaixo vai como legenda.
                        </div>
                      )}
                      {mediaProgress && <div style={{ fontSize: 11, color: 'var(--accent-light)', marginTop: 4 }}>{mediaProgress}</div>}
                      {mediaError && <div style={{ fontSize: 11, color: '#f87171', marginTop: 4 }}>{mediaError}</div>}
                    </div>
                    <button onClick={() => { setAttachPreview(null); setAttachQueue([]); setMediaError(''); }} disabled={sendingMedia}
                      style={{ padding: '7px 12px', borderRadius: 9, border: '1px solid var(--hairline)', background: 'var(--field-bg)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                      Cancelar
                    </button>
                    <button onClick={sendMedia} disabled={sendingMedia}
                      style={{ padding: '7px 14px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.18)', background: 'linear-gradient(180deg, #4F8FF7, #2E6BE6)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, opacity: sendingMedia ? 0.6 : 1 }}>
                      {sendingMedia ? 'Enviando…' : 'Enviar'}
                    </button>
                  </div>
                </div>
              )}
              {/* S3.1: menu do clipe */}
              {attachMenuOpen && (
                <div className="glass-modal fade-in" style={{ position: 'absolute', bottom: 'calc(100% + 10px)', left: 16, zIndex: 70, borderRadius: 14, padding: '6px 0', minWidth: 190 }}>
                  {([
                    ['document', 'Documento', 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6'],
                    ['media', 'Fotos e vídeos', 'M3 3h18v18H3z M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M21 15l-5-5L5 21'],
                  ] as const).map(([kind, label, path]) => (
                    <div key={kind}
                      onClick={() => { fileInputKind.current = kind; setAttachMenuOpen(false); fileInputRef.current?.click(); }}
                      style={{ padding: '9px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, transition: 'background 0.15s var(--ease-out)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-dim)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={path}/></svg>
                      {label}
                    </div>
                  ))}
                  {/* #5: câmera — no celular abre a câmera direto (atributo capture) */}
                  <div
                    onClick={() => { setAttachMenuOpen(false); cameraInputRef.current?.click(); }}
                    style={{ padding: '9px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, transition: 'background 0.15s var(--ease-out)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-dim)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                    Câmera
                  </div>
                </div>
              )}
              {/* #38: multiple — até 10 arquivos por vez, enviados em sequência */}
              <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }}
                accept={undefined}
                onChange={e => { onFilesPicked(e.target.files); e.target.value = ''; }} />
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                onChange={e => { fileInputKind.current = 'media'; onFilesPicked(e.target.files); e.target.value = ''; }} />
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                {/* S3.1: clipe de anexo */}
                <button onClick={() => setAttachMenuOpen(v => !v)} disabled={sending || recording} title="Anexar"
                  style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid var(--hairline)', background: attachMenuOpen ? 'var(--accent-dim)' : 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.18s var(--ease-out)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                </button>
                {recording ? (
                  /* S3.2 (issue #1): gravação em andamento */
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1.1s infinite' }} />
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                      Gravando… {Math.floor(recordSecs / 60)}:{String(recordSecs % 60).padStart(2, '0')}
                    </span>
                    <div style={{ flex: 1 }} />
                    <button onClick={() => stopRecording(true)} title="Descartar"
                      style={{ padding: '6px 12px', borderRadius: 9, border: '1px solid var(--hairline)', background: 'var(--field-bg)', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Descartar
                    </button>
                    <button onClick={() => stopRecording(false)} title="Parar e revisar"
                      style={{ padding: '6px 14px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.18)', background: 'linear-gradient(180deg, #4F8FF7, #2E6BE6)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                      Parar
                    </button>
                  </div>
                ) : (
                <textarea ref={inputRef} rows={1} value={newMsg} onChange={e => handleMsgChange(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Escape') { setShowTemplates(false); return; }
                    if (e.key === 'Enter' && !e.shiftKey && !showTemplates) { e.preventDefault(); sendMessage(); }
                  }}
                  onPaste={e => {
                    // S3.3 (issue #7): colar imagem/arquivo da área de transferência
                    const item = Array.from(e.clipboardData.items).find(i => i.kind === 'file');
                    if (item) {
                      const f = item.getAsFile();
                      if (f) { e.preventDefault(); fileToPreview(f); }
                    }
                  }}
                  placeholder={attachPreview ? 'Legenda (opcional)…' : 'Digite / para templates ou mensagem...'} disabled={sending}
                  style={{ flex: 1, padding: '8px 0', background: 'transparent', border: 'none', borderRadius: 0, color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxShadow: 'none', resize: 'none', maxHeight: 132, lineHeight: 1.5 }}
                />
                )}
                {/* S3.2: microfone */}
                {!recording && !newMsg.trim() && !attachPreview && (
                  <button onClick={startRecording} disabled={sending} title="Gravar áudio"
                    style={{ width: 34, height: 34, borderRadius: '50%', border: '1px solid var(--hairline)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.18s var(--ease-out)' }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                  </button>
                )}
                <button onClick={sendMessage} disabled={sending || sendingMedia || (!newMsg.trim() && !attachPreview) || showTemplates}
                  style={{ width: 38, height: 38, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.18)', background: 'linear-gradient(180deg, #4F8FF7, #2E6BE6)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: (sending || sendingMedia || (!newMsg.trim() && !attachPreview) || showTemplates) ? 0.45 : 1, transition: 'opacity 0.18s var(--ease-out), box-shadow 0.2s var(--ease-out), transform 0.22s var(--ease-spring)', boxShadow: (!sending && (newMsg.trim() || attachPreview)) ? '0 4px 14px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.28)' : 'inset 0 1px 0 rgba(255,255,255,0.2)' }}
                  onMouseEnter={e => { if (newMsg.trim() || attachPreview) e.currentTarget.style.transform = 'scale(1.08)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                >
                  <svg style={{ width: 16, height: 16, stroke: '#fff', fill: 'none', strokeWidth: 2 }} viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                </button>
              </div>
            </div>
        </div>
      ) : !isMobile ? (
        <div className="glass-panel anim" style={{ ['--i' as any]: 1, flex: 1, borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--text-muted)', fontSize: 14 }}>
          <div style={{ width: 52, height: 52, borderRadius: 18, background: 'var(--field-bg)', border: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
          {activeTab === 'grupos' ? 'Selecione um grupo para visualizar' : 'Selecione um contato para conversar'}
        </div>
      ) : null}

      {/* CRM Side Panel — oculto por padrão (S3.4, issue #2), abre pelo botão "Dados" */}
      {activeContact && !isMobile && showContactPanel && (
        <div className="glass-panel anim" style={{ ['--i' as any]: 2, width: 300, borderRadius: 'var(--radius-lg)', flexShrink: 0, overflowY: 'auto', padding: '14px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Dados do Contato</div>
            <a href={`/contato/${activeContact.id}`} style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}>Ver perfil</a>
          </div>

          {/* Editable fields — telefone com máscara e e-mail validado (issue #12) */}
          {([
            ['Nome', editName, setEditName, 'text'],
            ['Telefone', editPhone, (v: string) => setEditPhone(maskPhone(v)), 'tel'],
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
                style={{
                  width: '100%', padding: '7px 10px', background: 'var(--field-bg)',
                  border: `1px solid ${(label === 'Telefone' && !validPhone(value)) || (label === 'E-mail' && !validEmail(value)) ? 'rgba(239,68,68,0.55)' : 'var(--hairline)'}`,
                  borderRadius: 9, color: 'var(--text-primary)', fontSize: 12, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                }}
              />
            </div>
          ))}

          {/* S3.8 (issue #4): etiquetas da conversa */}
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>Etiquetas</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 5 }}>
              {(activeContact.tags || []).map(t => (
                <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 600, background: 'var(--accent-dim)', color: 'var(--accent-light)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 999, padding: '2px 8px' }}>
                  {t}
                  <svg onClick={() => {
                    const tags = (activeContact.tags || []).filter(x => x !== t);
                    patchContactLocal(activeContact.id, { tags });
                    fetch(`/api/contacts/${activeContact.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tags }) }).catch(() => {});
                  }} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" style={{ cursor: 'pointer', opacity: 0.7 }}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </span>
              ))}
            </div>
            <input
              placeholder="Nova etiqueta + Enter..."
              onKeyDown={e => {
                if (e.key !== 'Enter') return;
                const v = (e.target as HTMLInputElement).value.trim().toLowerCase();
                if (!v) return;
                const tags = [...new Set([...(activeContact.tags || []), v])];
                patchContactLocal(activeContact.id, { tags });
                fetch(`/api/contacts/${activeContact.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tags }) }).catch(() => {});
                (e.target as HTMLInputElement).value = '';
              }}
              style={{ width: '100%', padding: '6px 10px', background: 'var(--field-bg)', border: '1px solid var(--hairline)', borderRadius: 9, color: 'var(--text-primary)', fontSize: 11.5, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 3 }}>Observacoes</label>
            <textarea
              value={editNotes}
              onChange={e => setEditNotes(e.target.value)}
              placeholder="Notas sobre o contato..."
              rows={3}
              style={{ width: '100%', padding: '7px 10px', background: 'var(--field-bg)', border: '1px solid var(--hairline)', borderRadius: 9, color: 'var(--text-primary)', fontSize: 12, outline: 'none', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>

          <button
            onClick={saveContact}
            disabled={savingContact}
            style={{ width: '100%', padding: '8px 0', background: saveSuccess ? 'var(--green-dim)' : 'linear-gradient(180deg, #4F8FF7, #2E6BE6)', color: saveSuccess ? 'var(--green)' : '#fff', border: saveSuccess ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.18)', boxShadow: saveSuccess ? 'none' : '0 3px 12px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.28)', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: savingContact ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: savingContact ? 0.6 : 1, transition: 'all 0.22s var(--ease-out)' }}
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

      {/* #32: modal de encaminhamento — portal por causa do containing block do backdrop-filter */}
      {forwardMsg && createPortal(
        <ForwardModal message={forwardMsg} onClose={() => setForwardMsg(null)} />,
        document.body
      )}
    </div>
  );
}

// #32: escolhe o contato de destino e reenvia a mensagem (texto ou mídia do Storage)
function ForwardModal({ message, onClose }: { message: Message; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      const q = search.trim() ? `&search=${encodeURIComponent(search.trim())}` : '';
      fetch(`/api/contacts?limit=20&exclude_source=whatsapp_group${q}`)
        .then(r => r.json())
        .then(d => { setContacts((d.contacts || []).filter((c: Contact) => c.id !== message.contact_id && c.phone)); setLoading(false); })
        .catch(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [search, message.contact_id]);

  async function forwardTo(c: Contact) {
    if (sendingTo) return;
    setSendingTo(c.id);
    setError('');
    try {
      const r = await fetch('/api/messages/forward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: message.id, target_contact_id: c.id }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || 'Falha ao encaminhar.'); setSendingTo(null); return; }
      setDone(true);
      setTimeout(onClose, 900);
    } catch {
      setError('Erro de rede ao encaminhar.');
      setSendingTo(null);
    }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="glass-modal modal-pop" onClick={e => e.stopPropagation()}
        style={{ width: 'min(400px, 94vw)', maxHeight: '70vh', borderRadius: 18, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 14.5, fontWeight: 700 }}>Encaminhar para…</div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--hairline)', background: 'var(--field-bg)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}>×</button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '7px 10px', borderRadius: 9, background: 'var(--field-bg)', border: '1px solid var(--hairline)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {message.content_type === 'text' ? (message.body || '') : `[${message.content_type}] ${message.body || ''}`}
        </div>
        <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar contato…"
          style={{ padding: '9px 12px', background: 'var(--field-bg)', border: '1px solid var(--hairline)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
        {done && <div style={{ fontSize: 12.5, color: 'var(--green)', fontWeight: 600, textAlign: 'center' }}>Mensagem encaminhada ✓</div>}
        {error && <div style={{ fontSize: 12, color: '#f87171', textAlign: 'center' }}>{error}</div>}
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2, minHeight: 120 }}>
          {loading && <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 16 }}>Carregando…</div>}
          {!loading && contacts.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 16 }}>Nenhum contato encontrado.</div>}
          {contacts.map(c => (
            <button key={c.id} onClick={() => forwardTo(c)} disabled={!!sendingTo}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', opacity: sendingTo && sendingTo !== c.id ? 0.5 : 1, transition: 'background 0.15s var(--ease-out)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-dim)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--field-bg)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', flexShrink: 0 }}>
                {c.photo_url ? <img src={c.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (c.name || '?').charAt(0).toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{sendingTo === c.id ? 'Enviando…' : c.phone}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
