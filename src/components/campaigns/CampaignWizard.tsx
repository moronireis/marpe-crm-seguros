import { useState, useEffect, useRef } from 'react';
import { interpolateVariables } from '../../lib/variables';

/**
 * Wizard de campanha em 4 estágios (S5, PDF "Módulo Campanha" — estilo waSpeed):
 *   Destinatários → Ações → Envio → Resultados
 *
 * O formulário antigo era um painel único (nome + template + segmento). Aqui os
 * estágios existem de verdade: cada um só libera o próximo quando está válido, e
 * o de Resultados lê o status POR DESTINATÁRIO (antes só havia contador agregado).
 */

export interface SegmentFilter {
  tags?: string[]; ramo?: string; city?: string; produtor?: string; deal_type?: string;
  stage_id?: string; from_inbox?: boolean; include_groups?: boolean; manual_ids?: string[];
}
interface Template { id: string; name: string; body: string; }
interface Stage { id: string; name: string; funnel_name?: string }
interface Contact { id: string; name: string; phone: string | null; }

type MessageType = 'text' | 'media' | 'carousel';
type Step = 0 | 1 | 2 | 3;

const STEPS = ['Destinatários', 'Ações', 'Envio', 'Resultados'];

const INPUT: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '8px 11px',
  background: 'var(--field-bg)', border: '1px solid var(--hairline)',
  borderRadius: 9, color: 'var(--text-primary)', fontSize: 13,
  fontFamily: 'inherit', outline: 'none',
};
const LABEL: React.CSSProperties = {
  display: 'block', fontSize: 10.5, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5,
};

const RAMO_OPTIONS = ['auto', 'vida', 'residencial', 'empresarial', 'equipamento', 'consorcio', 'financiamento'];
const DEAL_TYPE_OPTIONS = ['prospeccao', 'renovacao', 'resgate', 'venda_cruzada', 'endosso'];
const TAG_OPTIONS = ['auto', 'vida', 'residencial', 'empresarial', 'equipamento'];

/** Lê um File como data URI — é o formato que a UazapiGO aceita em /send/media */
function fileToDataUri(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Falha ao ler o arquivo'));
    r.readAsDataURL(f);
  });
}

export default function CampaignWizard({ templates, onClose, onCreated }: {
  templates: Template[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [step, setStep] = useState<Step>(0);

  // Estágio 1 — destinatários
  const [segment, setSegment] = useState<SegmentFilter>({});
  const [stages, setStages] = useState<Stage[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);
  const [manualSearch, setManualSearch] = useState('');
  const [manualResults, setManualResults] = useState<Contact[]>([]);
  const [manualPicked, setManualPicked] = useState<Contact[]>([]);

  // Estágio 2 — ações
  const [name, setName] = useState('');
  const [messageType, setMessageType] = useState<MessageType>('text');
  const [templateId, setTemplateId] = useState('');
  const [bodyOverride, setBodyOverride] = useState('');
  const [media, setMedia] = useState<{ type: string; dataUri: string; filename: string } | null>(null);
  const [cards, setCards] = useState<Array<{ image: string; text: string }>>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const cardsRef = useRef<HTMLInputElement>(null);

  // Estágio 3/4
  const [sending, setSending] = useState(false);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [results, setResults] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/funnels')
      .then(r => r.json())
      .then(d => {
        const list: Stage[] = [];
        for (const f of (d.funnels || d || [])) {
          for (const s of (f.stages || f.funnel_stages || [])) {
            list.push({ id: s.id, name: s.name, funnel_name: f.name });
          }
        }
        setStages(list);
      })
      .catch(() => {});
  }, []);

  // Contagem ao vivo — o PDF pede saber quantos vão receber antes de disparar
  useEffect(() => {
    const t = setTimeout(() => {
      setCounting(true);
      fetch('/api/campaigns/preview-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segment_filter: { ...segment, manual_ids: manualPicked.map(c => c.id) } }),
      })
        .then(r => r.json())
        .then(d => setCount(typeof d.count === 'number' ? d.count : null))
        .catch(() => setCount(null))
        .finally(() => setCounting(false));
    }, 400);
    return () => clearTimeout(t);
  }, [segment, manualPicked]);

  // Busca de contato para adicionar à mão
  useEffect(() => {
    if (!manualSearch.trim()) { setManualResults([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/contacts?limit=8&search=${encodeURIComponent(manualSearch.trim())}`)
        .then(r => r.json())
        .then(d => setManualResults((d.contacts || []).filter((c: Contact) => c.phone)))
        .catch(() => setManualResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [manualSearch]);

  // Polling dos resultados enquanto a campanha dispara
  useEffect(() => {
    if (step !== 3 || !campaignId) return;
    let stop = false;
    const tick = () => {
      fetch(`/api/campaigns/${campaignId}/results`)
        .then(r => r.json())
        .then(d => { if (!stop) setResults(d); })
        .catch(() => {});
    };
    tick();
    const iv = setInterval(tick, 3000);
    return () => { stop = true; clearInterval(iv); };
  }, [step, campaignId]);

  const activeTemplate = templates.find(t => t.id === templateId);
  const effectiveBody = bodyOverride || activeTemplate?.body || '';
  const previewContact = { name: 'João Silva', phone: '(55) 99999-9999', city: 'São Sepé' };

  const canAdvance =
    step === 0 ? (count ?? 0) > 0
    : step === 1 ? (
        !!name.trim() &&
        (messageType === 'text' ? !!effectiveBody.trim()
          : messageType === 'media' ? !!media
          : cards.length > 0)
      )
    : true;

  function patchSegment(p: Partial<SegmentFilter>) {
    setSegment(s => ({ ...s, ...p }));
  }

  async function pickMedia(files: FileList | null) {
    if (!files?.length) return;
    const f = files[0];
    if (f.size > 45 * 1024 * 1024) { setError('Arquivo acima de 45 MB.'); return; }
    const dataUri = await fileToDataUri(f);
    const type = f.type.startsWith('video/') ? 'video' : f.type.startsWith('image/') ? 'image' : 'document';
    setMedia({ type, dataUri, filename: f.name });
    setError('');
  }

  async function pickCards(files: FileList | null) {
    if (!files?.length) return;
    const picked = Array.from(files).slice(0, 5 - cards.length);
    const next = [...cards];
    for (const f of picked) {
      if (!f.type.startsWith('image/')) continue;
      next.push({ image: await fileToDataUri(f), text: '' });
    }
    setCards(next.slice(0, 5));
    setError('');
  }

  async function createAndSend() {
    setSending(true); setError('');
    try {
      const createRes = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          template_id: templateId || null,
          segment_filter: { ...segment, manual_ids: manualPicked.map(c => c.id) },
          message_type: messageType,
          body_override: bodyOverride || null,
          media: messageType === 'media' ? media : messageType === 'carousel' ? { cards } : null,
        }),
      });
      const created = await createRes.json();
      if (!createRes.ok) { setError(created.error || 'Falha ao criar a campanha.'); setSending(false); return; }

      const id = created.campaign?.id || created.id;
      setCampaignId(id);

      const sendRes = await fetch(`/api/campaigns/${id}/send`, { method: 'POST' });
      const sendData = await sendRes.json();
      if (!sendRes.ok) { setError(sendData.error || 'Falha ao disparar.'); setSending(false); return; }

      setStep(3);
      onCreated();
    } catch (e: any) {
      setError(e?.message || 'Erro inesperado.');
    }
    setSending(false);
  }

  const chip = (on: boolean): React.CSSProperties => ({
    padding: '5px 11px', borderRadius: 999, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'inherit',
    background: on ? 'var(--accent-dim)' : 'var(--field-bg)',
    border: `1px solid ${on ? 'rgba(59,130,246,0.4)' : 'var(--hairline)'}`,
    color: on ? 'var(--accent-light)' : 'var(--text-secondary)',
  });

  return (
    <div className="overlay-glass" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="glass-modal modal-pop" style={{
        borderRadius: 'var(--radius-xl)', width: 640, maxWidth: 'calc(100vw - 32px)', maxHeight: '92vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Trilha dos estágios */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--hairline)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>Nova campanha</span>
            <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--hairline)', background: 'var(--field-bg)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}>×</button>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {STEPS.map((label, i) => (
              <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                <div style={{ height: 3, borderRadius: 2, background: i <= step ? 'var(--accent)' : 'var(--hairline)' }} />
                <span style={{ fontSize: 10.5, fontWeight: 600, color: i === step ? 'var(--accent-light)' : 'var(--text-muted)' }}>
                  {i + 1}. {label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── 1. DESTINATÁRIOS ── */}
          {step === 0 && (
            <>
              <div>
                <label style={LABEL}>Etiquetas</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {TAG_OPTIONS.map(t => {
                    const on = segment.tags?.includes(t) || false;
                    return (
                      <button key={t} style={chip(on)} onClick={() => patchSegment({
                        tags: on ? (segment.tags || []).filter(x => x !== t) : [...(segment.tags || []), t],
                      })}>{t}</button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={LABEL}>Ramo</label>
                  <select style={INPUT} value={segment.ramo || ''} onChange={e => patchSegment({ ramo: e.target.value || undefined })}>
                    <option value="">Todos</option>
                    {RAMO_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label style={LABEL}>Tipo de negócio</label>
                  <select style={INPUT} value={segment.deal_type || ''} onChange={e => patchSegment({ deal_type: e.target.value || undefined })}>
                    <option value="">Todos</option>
                    {DEAL_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={LABEL}>Etapa do funil (CRM)</label>
                  <select style={INPUT} value={segment.stage_id || ''} onChange={e => patchSegment({ stage_id: e.target.value || undefined })}>
                    <option value="">Todas</option>
                    {stages.map(s => <option key={s.id} value={s.id}>{s.funnel_name ? `${s.funnel_name} · ` : ''}{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={LABEL}>Cidade</label>
                  <input style={INPUT} value={segment.city || ''} onChange={e => patchSegment({ city: e.target.value || undefined })} placeholder="Todas" />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button style={chip(!!segment.from_inbox)} onClick={() => patchSegment({ from_inbox: !segment.from_inbox })}>
                  Só quem tem conversa no inbox
                </button>
                <button style={chip(!!segment.include_groups)} onClick={() => patchSegment({ include_groups: !segment.include_groups })}>
                  Incluir grupos
                </button>
              </div>

              <div>
                <label style={LABEL}>Adicionar contato manualmente</label>
                <input style={INPUT} value={manualSearch} onChange={e => setManualSearch(e.target.value)} placeholder="Buscar por nome ou telefone…" />
                {manualResults.length > 0 && (
                  <div style={{ marginTop: 6, border: '1px solid var(--hairline)', borderRadius: 9, overflow: 'hidden' }}>
                    {manualResults.map(c => (
                      <button key={c.id}
                        onClick={() => { setManualPicked(p => p.some(x => x.id === c.id) ? p : [...p, c]); setManualSearch(''); setManualResults([]); }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 11px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', fontSize: 12.5, color: 'var(--text-primary)', fontFamily: 'inherit' }}>
                        {c.name} <span style={{ color: 'var(--text-muted)' }}>{c.phone}</span>
                      </button>
                    ))}
                  </div>
                )}
                {manualPicked.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                    {manualPicked.map(c => (
                      <span key={c.id} style={{ ...chip(true), display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {c.name}
                        <span onClick={() => setManualPicked(p => p.filter(x => x.id !== c.id))} style={{ cursor: 'pointer', opacity: 0.7 }}>×</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ padding: '11px 14px', borderRadius: 10, background: 'var(--accent-dim)', border: '1px solid rgba(59,130,246,0.3)' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-light)' }}>
                  {counting ? 'Calculando…' : count === null ? '—' : `${count} destinatário${count === 1 ? '' : 's'}`}
                </span>
                <span style={{ fontSize: 11.5, color: 'var(--text-muted)', marginLeft: 8 }}>
                  vão receber esta campanha
                </span>
              </div>
            </>
          )}

          {/* ── 2. AÇÕES ── */}
          {step === 1 && (
            <>
              <div>
                <label style={LABEL}>Nome da campanha</label>
                <input style={INPUT} value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Renovações de agosto" autoFocus />
              </div>

              <div>
                <label style={LABEL}>Tipo de mensagem</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {([['text', 'Simples'], ['media', 'Foto / vídeo'], ['carousel', 'Carrossel (até 5)']] as const).map(([v, l]) => (
                    <button key={v} style={{ ...chip(messageType === v), flex: 1 }} onClick={() => setMessageType(v)}>{l}</button>
                  ))}
                </div>
              </div>

              <div>
                <label style={LABEL}>Template (opcional)</label>
                <select style={INPUT} value={templateId} onChange={e => { setTemplateId(e.target.value); setBodyOverride(''); }}>
                  <option value="">— Escrever mensagem personalizada —</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>

              <div>
                <label style={LABEL}>{messageType === 'text' ? 'Mensagem' : 'Legenda'}</label>
                <textarea
                  style={{ ...INPUT, minHeight: 84, resize: 'vertical' }}
                  value={bodyOverride || activeTemplate?.body || ''}
                  onChange={e => setBodyOverride(e.target.value)}
                  placeholder="Use {{nome}}, {{primeiro_nome}}, {{cidade}}…"
                />
                {effectiveBody.includes('{{') && (
                  <div style={{ marginTop: 6, padding: '8px 11px', borderRadius: 9, background: 'var(--field-bg)', border: '1px solid var(--hairline)', fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                    <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--accent-light)', display: 'block', marginBottom: 3 }}>
                      Prévia (exemplo)
                    </span>
                    {interpolateVariables(effectiveBody, { contact: previewContact as any })}
                  </div>
                )}
              </div>

              {messageType === 'media' && (
                <div>
                  <label style={LABEL}>Arquivo</label>
                  <input ref={fileRef} type="file" accept="image/*,video/*" style={{ display: 'none' }} onChange={e => { pickMedia(e.target.files); e.target.value = ''; }} />
                  <button onClick={() => fileRef.current?.click()} style={{ ...INPUT, cursor: 'pointer', textAlign: 'left', color: media ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                    {media ? `${media.filename} (${media.type})` : 'Escolher foto ou vídeo…'}
                  </button>
                  {media?.type === 'image' && <img src={media.dataUri} alt="" style={{ marginTop: 8, maxWidth: 180, borderRadius: 9 }} />}
                </div>
              )}

              {messageType === 'carousel' && (
                <div>
                  <label style={LABEL}>Fotos do carrossel ({cards.length}/5)</label>
                  <input ref={cardsRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => { pickCards(e.target.files); e.target.value = ''; }} />
                  <button onClick={() => cardsRef.current?.click()} disabled={cards.length >= 5}
                    style={{ ...INPUT, cursor: cards.length >= 5 ? 'default' : 'pointer', textAlign: 'left', color: 'var(--text-muted)', opacity: cards.length >= 5 ? 0.5 : 1 }}>
                    {cards.length >= 5 ? 'Limite de 5 fotos atingido' : 'Adicionar fotos…'}
                  </button>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                    {cards.map((c, i) => (
                      <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
                        <img src={c.image} alt="" style={{ width: 46, height: 46, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />
                        <input style={{ ...INPUT, flex: 1 }} value={c.text} placeholder={`Texto do card ${i + 1} (opcional)`}
                          onChange={e => setCards(cs => cs.map((x, j) => j === i ? { ...x, text: e.target.value } : x))} />
                        <button onClick={() => setCards(cs => cs.filter((_, j) => j !== i))}
                          style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid var(--hairline)', background: 'var(--field-bg)', color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0 }}>×</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── 3. ENVIO ── */}
          {step === 2 && (
            <>
              <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--field-bg)', border: '1px solid var(--hairline)', display: 'flex', flexDirection: 'column', gap: 7 }}>
                {[
                  ['Campanha', name],
                  ['Destinatários', counting ? '…' : `${count ?? 0}`],
                  ['Tipo', messageType === 'text' ? 'Mensagem simples' : messageType === 'media' ? `Mídia (${media?.type})` : `Carrossel (${cards.length} fotos)`],
                  ['Template', activeTemplate?.name || 'personalizada'],
                ].map(([k, v]) => (
                  <div key={k as string} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{ padding: '11px 14px', borderRadius: 10, background: 'var(--amber-dim)', border: '1px solid rgba(217,119,6,0.3)', fontSize: 11.5, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                O disparo sai a <strong>1 mensagem por segundo</strong> para reduzir risco de bloqueio —
                {count ? ` cerca de ${Math.ceil(count / 60)} min para ${count} contatos.` : ' o tempo depende do total.'}
                {' '}Depois de iniciado não dá para cancelar pela tela.
              </div>
            </>
          )}

          {/* ── 4. RESULTADOS ── */}
          {step === 3 && (
            <>
              <div style={{ display: 'flex', gap: 10 }}>
                {[
                  ['Enviadas', results?.sent ?? 0, 'var(--green)'],
                  ['Falhas', results?.failed ?? 0, '#f87171'],
                  ['Total', results?.total ?? 0, 'var(--text-primary)'],
                ].map(([k, v, color]) => (
                  <div key={k as string} style={{ flex: 1, padding: '11px 13px', borderRadius: 10, background: 'var(--field-bg)', border: '1px solid var(--hairline)' }}>
                    <div style={{ fontSize: 19, fontWeight: 700, color: color as string }}>{v as number}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k}</div>
                  </div>
                ))}
              </div>

              {results?.campaign?.status === 'sending' && (
                <div style={{ fontSize: 12, color: 'var(--amber)' }}>Disparo em andamento — a lista atualiza sozinha.</div>
              )}

              {results?.error_summary?.length > 0 && (
                <div style={{ padding: '10px 12px', borderRadius: 9, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.25)' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#f87171', marginBottom: 5 }}>Motivos de falha</div>
                  {results.error_summary.map((e: any, i: number) => (
                    <div key={i} style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{e.count}× — {e.error}</div>
                  ))}
                </div>
              )}

              <div style={{ border: '1px solid var(--hairline)', borderRadius: 10, overflow: 'hidden', maxHeight: 260, overflowY: 'auto' }}>
                {(results?.recipients || []).map((r: any) => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 11px', borderBottom: '1px solid var(--border-subtle)', fontSize: 12 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: r.status === 'sent' ? 'var(--green)' : '#f87171' }} />
                    <span style={{ flex: 1, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name || r.phone}</span>
                    <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{r.status === 'sent' ? 'enviada' : (r.error || 'falhou')}</span>
                  </div>
                ))}
                {(!results?.recipients || results.recipients.length === 0) && (
                  <div style={{ padding: 18, textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>Aguardando os primeiros envios…</div>
                )}
              </div>
            </>
          )}

          {error && (
            <div style={{ padding: '9px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, fontSize: 12, color: '#f87171' }}>
              {error}
            </div>
          )}
        </div>

        {/* Navegação */}
        <div style={{ padding: '13px 20px', borderTop: '1px solid var(--hairline)', display: 'flex', justifyContent: 'space-between', gap: 10, flexShrink: 0 }}>
          <button
            onClick={() => (step === 0 ? onClose() : setStep((step - 1) as Step))}
            disabled={step === 3}
            style={{ padding: '9px 16px', borderRadius: 10, border: '1px solid var(--hairline)', background: 'var(--field-bg)', color: 'var(--text-secondary)', fontSize: 13, cursor: step === 3 ? 'default' : 'pointer', fontFamily: 'inherit', opacity: step === 3 ? 0.4 : 1 }}>
            {step === 0 ? 'Cancelar' : 'Voltar'}
          </button>

          {step < 2 && (
            <button onClick={() => setStep((step + 1) as Step)} disabled={!canAdvance}
              style={{ padding: '9px 20px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.18)', background: 'linear-gradient(180deg, #4F8FF7, #2E6BE6)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: canAdvance ? 'pointer' : 'default', fontFamily: 'inherit', opacity: canAdvance ? 1 : 0.45 }}>
              Continuar
            </button>
          )}
          {step === 2 && (
            <button onClick={createAndSend} disabled={sending}
              style={{ padding: '9px 20px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.18)', background: 'linear-gradient(180deg, #4F8FF7, #2E6BE6)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: sending ? 'default' : 'pointer', fontFamily: 'inherit', opacity: sending ? 0.6 : 1 }}>
              {sending ? 'Disparando…' : `Disparar para ${count ?? 0}`}
            </button>
          )}
          {step === 3 && (
            <button onClick={onClose}
              style={{ padding: '9px 20px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.18)', background: 'linear-gradient(180deg, #4F8FF7, #2E6BE6)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Concluir
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
