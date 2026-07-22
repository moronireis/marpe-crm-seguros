import { useState, useEffect, useRef } from 'react';
import TemplateDropdown, { useTemplates, type Template } from '../shared/TemplateDropdown';
import { interpolateVariables, type InterpolationContext } from '../../lib/variables';

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
  /** Contexto para o preview de variáveis ({{primeiro_nome}} etc.) — item 5 do checkpoint */
  varContext?: InterpolationContext;
}

type AttachItem = { kind: 'image' | 'video' | 'document' | 'audio'; dataURI: string; mime: string; filename: string };

export default function DealTabConversas({ dealId, contactPhone, contactId, onSendMessage, varContext }: Props) {
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Template picker: "/" prefix opens the dropdown (same UX as the inbox)
  const templates = useTemplates();
  const pickerOpen = text.startsWith('/');
  const hasVars = /\{\{\w+\}\}/.test(text);

  // #39 (board 22/07): paridade com o Inbox — anexos multi-arquivo + áudio
  const [attach, setAttach] = useState<AttachItem | null>(null);
  const [attachQueue, setAttachQueue] = useState<AttachItem[]>([]);
  const [sendingMedia, setSendingMedia] = useState(false);
  const [mediaError, setMediaError] = useState('');
  const [mediaProgress, setMediaProgress] = useState('');
  const [recording, setRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recDiscardRef = useRef(false);
  // #30: "Carregar anteriores"
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  function resizeComposer() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 132) + 'px';
  }

  function selectTemplate(tpl: Template) {
    setText(tpl.body);
    inputRef.current?.focus();
    requestAnimationFrame(resizeComposer);
  }

  // Filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  function buildUrl(before?: string) {
    // Query by contact: the WhatsApp thread belongs to the person. Inbound messages
    // arrive by phone number and never carry deal_id, so filtering by deal_id showed
    // an empty conversation on most deals. Fallback to deal_id when contact is missing.
    let url = contactId
      ? `/api/messages?contact_id=${contactId}`
      : `/api/messages?deal_id=${dealId}`;
    if (dateFrom) url += `&date_from=${dateFrom}`;
    if (dateTo) url += `&date_to=${dateTo}`;
    if (search.trim()) url += `&search=${encodeURIComponent(search.trim())}`;
    if (before) url += `&before=${encodeURIComponent(before)}`;
    return url;
  }

  function loadMessages() {
    fetch(buildUrl())
      .then(r => r.json())
      .then(d => {
        setMsgs(prev => {
          const incoming: Message[] = d.messages || [];
          // preserva janelas antigas carregadas via "Carregar anteriores"
          if (prev.length && incoming.length && prev[prev.length - 1]?.id === incoming[incoming.length - 1]?.id) return prev;
          if (prev.length && incoming.length) {
            const known = new Set(prev.map(m => m.id));
            const fresh = incoming.filter(m => !known.has(m.id));
            if (fresh.length && prev.some(m => m.id === incoming[0]?.id)) return [...prev, ...fresh];
          }
          return incoming;
        });
        setHasMore(!!d.has_more);
        setLoading(false);
        setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      })
      .catch(() => setLoading(false));
  }

  async function loadOlder() {
    if (loadingOlder || msgs.length === 0) return;
    setLoadingOlder(true);
    try {
      const r = await fetch(buildUrl(msgs[0].created_at));
      const d = await r.json();
      const older: Message[] = d.messages || [];
      const list = listRef.current;
      const prevHeight = list?.scrollHeight || 0;
      setMsgs(prev => [...older, ...prev]);
      setHasMore(!!d.has_more);
      requestAnimationFrame(() => { if (list) list.scrollTop = list.scrollHeight - prevHeight + list.scrollTop; });
    } catch {}
    setLoadingOlder(false);
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
    if (attach) { await sendMedia(); return; }
    if (!text.trim() || sending) return;
    setSending(true);
    await onSendMessage(text);
    setText('');
    setSending(false);
    if (inputRef.current) inputRef.current.style.height = 'auto';
    loadMessages();
    // #31: devolve o foco ao composer após enviar
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  // #39: seleção de arquivos (multi) — 1º vira preview, demais na fila
  function onFilesPicked(files: FileList | null) {
    const list = Array.from(files || []).filter(f => f.size <= 45 * 1024 * 1024).slice(0, 10);
    if (list.length === 0) return;
    setMediaError('');
    Promise.all(list.map(f => new Promise<AttachItem>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve({
        kind: f.type.startsWith('image/') ? 'image' : f.type.startsWith('video/') ? 'video' : 'document',
        dataURI: String(reader.result),
        mime: f.type || 'application/octet-stream',
        filename: f.name,
      });
      reader.readAsDataURL(f);
    }))).then(items => { setAttach(items[0]); setAttachQueue(items.slice(1)); });
  }

  // #39: gravação de áudio (mesmo fluxo do Inbox — UazapiGO transcodifica p/ voz)
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
        reader.onload = () => setAttach({ kind: 'audio', dataURI: String(reader.result), mime: blob.type, filename: 'audio.webm' });
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

  async function sendMedia() {
    if (!attach || !contactId || sendingMedia) return;
    setSendingMedia(true);
    setMediaError('');
    const items = [attach, ...attachQueue];
    const caption = text.trim();
    let failed = 0;
    for (let i = 0; i < items.length; i++) {
      if (items.length > 1) setMediaProgress(`Enviando ${i + 1}/${items.length}…`);
      try {
        const res = await fetch('/api/messages/media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contact_id: contactId,
            phone: contactPhone,
            kind: items[i].kind,
            data: items[i].dataURI,
            filename: items[i].filename,
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
      setAttach(null);
      setAttachQueue([]);
      if (caption) { setText(''); if (inputRef.current) inputRef.current.style.height = 'auto'; }
      loadMessages();
    }
    setSendingMedia(false);
    inputRef.current?.focus();
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
              style={{ padding: '4px 6px', background: 'var(--field-bg)', border: '1px solid var(--hairline)', borderRadius: 4, color: 'var(--text-primary)', fontSize: 11, outline: 'none', fontFamily: 'inherit' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Até</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ padding: '4px 6px', background: 'var(--field-bg)', border: '1px solid var(--hairline)', borderRadius: 4, color: 'var(--text-primary)', fontSize: 11, outline: 'none', fontFamily: 'inherit' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 120 }}>
            <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Buscar</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar nas mensagens..."
              style={{ padding: '4px 6px', background: 'var(--field-bg)', border: '1px solid var(--hairline)', borderRadius: 4, color: 'var(--text-primary)', fontSize: 11, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }} />
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {!loading && hasMore && (
          <button onClick={loadOlder} disabled={loadingOlder}
            style={{ alignSelf: 'center', padding: '5px 14px', borderRadius: 999, border: '1px solid var(--hairline)', background: 'var(--field-bg)', color: 'var(--text-secondary)', fontSize: 10.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, opacity: loadingOlder ? 0.6 : 1 }}>
            {loadingOlder ? 'Carregando…' : 'Carregar mensagens anteriores'}
          </button>
        )}
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
              padding: '8px 12px', borderRadius: 14,
              background: m.direction === 'outbound' ? 'var(--msg-out-bg)' : 'var(--msg-in-bg)',
              border: '1px solid var(--hairline)',
              boxShadow: 'var(--shadow-xs)',
              borderBottomRightRadius: m.direction === 'outbound' ? 4 : 14,
              borderBottomLeftRadius: m.direction === 'inbound' ? 4 : 14,
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

      {/* Send input — textarea expansível + preview de variáveis (item 5) */}
      {contactPhone ? (
        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0, position: 'relative' }}>
          <TemplateDropdown
            visible={pickerOpen}
            filter={pickerOpen ? text.slice(1).toLowerCase() : ''}
            templates={templates}
            onSelect={selectTemplate}
          />
          {hasVars && !pickerOpen && !attach && (
            <div className="fade-in" style={{ padding: '7px 10px', borderRadius: 10, background: 'var(--accent-dim)', border: '1px dashed rgba(59,130,246,0.3)', fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--accent-light)', display: 'block', marginBottom: 2 }}>Preview da mensagem</span>
              {interpolateVariables(text, varContext || {})}
            </div>
          )}
          {/* #39: preview do anexo — o texto digitado vira a legenda */}
          {attach && (
            <div className="fade-in" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, background: 'var(--field-bg)', border: '1px solid var(--hairline)' }}>
              {attach.kind === 'image' && <img src={attach.dataURI} alt="" style={{ width: 42, height: 42, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />}
              {attach.kind !== 'image' && (
                <div style={{ width: 42, height: 42, borderRadius: 8, background: 'var(--accent-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.7" strokeLinecap="round">
                    {attach.kind === 'audio'
                      ? <><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></>
                      : <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></>}
                  </svg>
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {attach.kind === 'audio' ? 'Mensagem de voz' : attach.filename}
                  {attachQueue.length > 0 && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> + {attachQueue.length} arquivo{attachQueue.length > 1 ? 's' : ''}</span>}
                </div>
                {mediaProgress && <div style={{ fontSize: 10.5, color: 'var(--accent-light)' }}>{mediaProgress}</div>}
                {mediaError && <div style={{ fontSize: 10.5, color: '#f87171' }}>{mediaError}</div>}
              </div>
              <button onClick={() => { setAttach(null); setAttachQueue([]); setMediaError(''); }} disabled={sendingMedia}
                style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid var(--hairline)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                Cancelar
              </button>
            </div>
          )}
          {mediaError && !attach && <div style={{ fontSize: 10.5, color: '#f87171' }}>{mediaError}</div>}
          {recording ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#ef4444', animation: 'pulse 1.1s infinite' }} />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                Gravando… {Math.floor(recordSecs / 60)}:{String(recordSecs % 60).padStart(2, '0')}
              </span>
              <div style={{ flex: 1 }} />
              <button onClick={() => stopRecording(true)}
                style={{ padding: '5px 11px', borderRadius: 8, border: '1px solid var(--hairline)', background: 'var(--field-bg)', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
                Descartar
              </button>
              <button onClick={() => stopRecording(false)}
                style={{ padding: '5px 13px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.18)', background: 'linear-gradient(180deg, #4F8FF7, #2E6BE6)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                Parar
              </button>
            </div>
          ) : (
          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
            <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }}
              onChange={e => { onFilesPicked(e.target.files); e.target.value = ''; }} />
            {/* #39: clipe de anexo */}
            <button onClick={() => fileInputRef.current?.click()} disabled={sending || sendingMedia} title="Anexar"
              style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--hairline)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            </button>
            <textarea
              ref={inputRef}
              rows={1}
              value={text}
              onChange={e => { setText(e.target.value); resizeComposer(); }}
              onKeyDown={e => {
                if (e.key === 'Escape' && pickerOpen) { setText(''); return; }
                if (e.key === 'Enter' && !e.shiftKey && !pickerOpen) { e.preventDefault(); handleSend(); }
              }}
              placeholder={attach ? 'Legenda (opcional)…' : 'Digite / para templates ou mensagem...'}
              style={{ flex: 1, padding: '8px 10px', background: 'var(--field-bg)', border: '1px solid var(--hairline)', borderRadius: 10, color: 'var(--text-primary)', fontSize: 12, outline: 'none', fontFamily: 'inherit', resize: 'none', maxHeight: 132, lineHeight: 1.5, boxSizing: 'border-box' }}
            />
            {/* #39: microfone (aparece com o composer vazio, como no Inbox) */}
            {!text.trim() && !attach && (
              <button onClick={startRecording} disabled={sending || sendingMedia} title="Gravar áudio"
                style={{ width: 32, height: 32, borderRadius: '50%', border: '1px solid var(--hairline)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              </button>
            )}
            <button
              onClick={handleSend}
              disabled={sending || sendingMedia || (!text.trim() && !attach) || pickerOpen}
              style={{ padding: '8px 14px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.18)', background: 'linear-gradient(180deg, #4F8FF7, #2E6BE6)', boxShadow: '0 2px 10px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.28)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', opacity: (sending || sendingMedia || pickerOpen) ? 0.6 : 1, transition: 'all 0.2s var(--ease-out)', flexShrink: 0 }}
            >
              {sendingMedia ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
          )}
        </div>
      ) : (
        <div style={{ padding: 12, fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          Contato sem telefone registrado
        </div>
      )}
    </div>
  );
}
