import { useState, useEffect, useRef, useMemo } from 'react';

/**
 * Player de áudio estilo WhatsApp — waveform em canvas, progresso suave via rAF,
 * arrastar para buscar.
 *
 * Extraído do InboxView em 27/07 (S1) para resolver dois apontamentos de uma vez:
 *  - #3: a aba Conversas do card do CRM usava `<audio controls>` nativo, que
 *        renderiza a barra branca do navegador. Agora as duas telas usam este player.
 *  - #12: só um áudio toca por vez — os players se registram num controlador
 *        único de módulo e pausam os demais ao dar play.
 *
 * As cores do waveform vêm dos tokens --wave-* (o canvas não herda cor do CSS,
 * então no tema claro as barras brancas sumiam).
 */

// ── Controlador global: garante um único áudio tocando ──────────────────────
const players = new Set<() => void>();
function registerPlayer(pause: () => void) {
  players.add(pause);
  return () => players.delete(pause);
}
function stopOthers(mine: () => void) {
  players.forEach(p => { if (p !== mine) p(); });
}

function readWaveColors(el: HTMLElement | null) {
  const fallback = { idle: 'rgba(255,255,255,0.22)', fill: 'rgba(96,165,250,0.9)', head: 'rgba(147,197,253,0.75)' };
  if (!el || typeof window === 'undefined') return fallback;
  const cs = getComputedStyle(el);
  const pick = (name: string, def: string) => cs.getPropertyValue(name).trim() || def;
  return {
    idle: pick('--wave-idle', fallback.idle),
    fill: pick('--wave-fill', fallback.fill),
    head: pick('--wave-head', fallback.head),
  };
}

export default function AudioPlayer({ src, mime, avatarUrl }: { src: string | null; mime?: string | null; avatarUrl?: string | null }) {
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0); // 0-1
  const [loadError, setLoadError] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const dragging = useRef(false);
  const progressRef = useRef(0); // espelho do progresso para os observers, sem re-render

  // Alturas determinísticas a partir da URL — o mesmo áudio desenha igual sempre
  const bars = useMemo(() => {
    const n = 52;
    const seed = src || 'x';
    return Array.from({ length: n }, (_, i) => {
      const v = Math.abs(Math.sin(i * 127.1 + seed.charCodeAt(i % seed.length) * 0.031) * 43758.5) % 1;
      const shape = Math.sin((i / n) * Math.PI); // curva de sino
      return Math.max(0.08, Math.min(1, v * 0.55 + shape * 0.55));
    });
  }, [src]);

  const draw = useRef((prog: number) => {});
  draw.current = (prog: number) => {
    const canvas = canvasRef.current;
    const box = wrapRef.current;
    if (!canvas || !box) return;
    const dpr = window.devicePixelRatio || 1;
    // A medida SEMPRE vem do wrapper, nunca da própria canvas.
    // Ler `canvas.clientWidth` aqui era o bug do chamado 27e9e5be: escrever
    // `canvas.width` muda a largura INTRÍNSECA do elemento e, como `min-width: auto`
    // de um elemento substituído resolve para a intrínseca, o layout crescia — o que
    // realimentava esta função (rAF, 60fps) e espalhava as barras pela tela toda.
    // Só acontecia com devicePixelRatio > 1 (Windows a 125%, retina).
    const w = Math.round(box.clientWidth);
    const h = Math.round(box.clientHeight);
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);

    const colors = readWaveColors(canvas);
    const n = bars.length;
    const barW = 2.5;
    const gap = (w - n * barW) / (n - 1);
    const cx = prog * w;

    for (let i = 0; i < n; i++) {
      const x = i * (barW + gap);
      const barH = Math.round(bars[i] * (h - 6) + 5);
      const y = (h - barH) / 2;
      const filled = x + barW <= cx;
      const atHead = !filled && x <= cx + barW;

      ctx.fillStyle = filled ? colors.fill : (atHead && prog > 0 ? colors.head : colors.idle);
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, 1.5);
      ctx.fill();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  // Loop de rAF para progresso suave — SÓ enquanto este áudio toca.
  // Antes o loop rodava sempre, chamando setProgress a 60fps em TODOS os players
  // da conversa (re-render em cascata) mesmo com tudo pausado.
  useEffect(() => {
    if (!playing) return;
    function tick() {
      const el = audioRef.current;
      if (el && el.duration > 0) {
        const p = el.currentTime / el.duration;
        progressRef.current = p;
        setProgress(p);
        draw.current(p);
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [playing]);

  // Primeira pintura (barras cinza) quando a canvas entra na tela
  useEffect(() => { draw.current(progressRef.current); }, [bars]);

  // #12: registra o "pause" deste player no controlador global
  useEffect(() => {
    const pauseMe = () => {
      const el = audioRef.current;
      if (el && !el.paused) { el.pause(); setPlaying(false); }
    };
    return registerPlayer(pauseMe);
  }, []);

  // Redesenha ao redimensionar e ao trocar de tema (as cores vêm do CSS)
  // Sem `progress` na lista de dependências: com ele, os observers eram destruídos
  // e recriados a cada quadro do rAF.
  useEffect(() => {
    // Observa o WRAPPER — observar a canvas fecharia o laço de realimentação
    const ro = new ResizeObserver(() => draw.current(progressRef.current));
    if (wrapRef.current) ro.observe(wrapRef.current);
    const mo = new MutationObserver(() => draw.current(progressRef.current));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => { ro.disconnect(); mo.disconnect(); };
  }, []);

  function togglePlay() {
    const el = audioRef.current;
    if (!el || loadError) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      // #12: pausa todos os outros antes de tocar este
      const pauseMe = () => { if (!el.paused) { el.pause(); setPlaying(false); } };
      stopOthers(pauseMe);
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
    progressRef.current = ratio;
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

  const micIcon = (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    </svg>
  );

  if (!src) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 12, fontStyle: 'italic' }}>
        {micIcon} Áudio indisponível
      </div>
    );
  }

  if (loadError) {
    // Proxy 410 (expirada na UazapiGO) ou rede — estado terminal, sem link morto (fix #21)
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 12, fontStyle: 'italic' }}>
        {micIcon} Áudio expirado — peça para reenviar
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 210, maxWidth: 290, userSelect: 'none' }}>
      {/* Avatar / mic */}
      <div style={{
        width: 40, height: 40, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
        background: 'var(--accent-dim)', border: '1px solid var(--hairline-strong)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {avatarUrl
          ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-light)" strokeWidth="1.8" strokeLinecap="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
        }
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={togglePlay}
            aria-label={playing ? 'Pausar áudio' : 'Tocar áudio'}
            style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0, border: 'none',
              background: 'var(--accent)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: playing ? '0 0 0 4px var(--accent-dim), 0 2px 8px var(--accent-glow)' : '0 2px 8px var(--accent-glow)',
              transition: 'box-shadow 0.2s, transform 0.1s',
            }}
            onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.92)')}
            onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
          >
            {playing
              ? <svg width="11" height="11" viewBox="0 0 24 24" fill="white"><rect x="5" y="4" width="4" height="16" rx="1" /><rect x="15" y="4" width="4" height="16" rx="1" /></svg>
              : <svg width="11" height="11" viewBox="0 0 24 24" fill="white" style={{ marginLeft: 2 }}><polygon points="5 3 19 12 5 21" /></svg>
            }
          </button>

          {/* O wrapper é quem tem tamanho no layout; a canvas é absoluta e nunca
              influencia a largura do pai (ver comentário em draw.current). */}
          <div
            ref={wrapRef}
            style={{ flex: 1, minWidth: 0, height: 34, position: 'relative', overflow: 'hidden', cursor: 'pointer' }}
            onMouseDown={e => { dragging.current = true; seek(e.clientX, e.currentTarget.getBoundingClientRect()); }}
            onMouseMove={e => { if (dragging.current) seek(e.clientX, e.currentTarget.getBoundingClientRect()); }}
            onMouseUp={() => { dragging.current = false; }}
            onMouseLeave={() => { dragging.current = false; }}
            onTouchStart={e => seek(e.touches[0].clientX, e.currentTarget.getBoundingClientRect())}
            onTouchMove={e => seek(e.touches[0].clientX, e.currentTarget.getBoundingClientRect())}
          >
            <canvas
              ref={canvasRef}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
            />
          </div>
        </div>

        <div style={{ fontSize: 10, color: 'var(--text-muted)', paddingLeft: 40, letterSpacing: '0.02em' }}>
          {displayTime}
        </div>
      </div>

      <audio
        ref={audioRef}
        preload="metadata"
        onLoadedMetadata={() => { setDuration(audioRef.current?.duration || 0); draw.current(progressRef.current); }}
        onEnded={() => { setPlaying(false); progressRef.current = 0; setProgress(0); draw.current(0); }}
        onPause={() => setPlaying(false)}
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
