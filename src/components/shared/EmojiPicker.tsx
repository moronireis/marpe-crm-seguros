import { useState, useMemo, useEffect, useRef } from 'react';

/**
 * Seletor de emojis do composer (S1 #11, 27/07).
 *
 * Sem biblioteca externa de propósito: um pacote de emojis costuma passar de
 * 1 MB e este projeto renderiza tudo com estilo inline. Aqui é uma curadoria
 * das carinhas e símbolos que o atendimento de corretora realmente usa, com
 * busca por palavra-chave em português e uma faixa de "recentes" (localStorage).
 */

type Group = { key: string; label: string; icon: string; items: Array<[string, string]> };

// [emoji, palavras-chave para busca]
const GROUPS: Group[] = [
  {
    key: 'frequentes', label: 'Rosto e gestos', icon: '🙂',
    items: [
      ['😀', 'feliz sorriso'], ['😃', 'feliz alegre'], ['😄', 'feliz riso'], ['😁', 'sorriso dentes'],
      ['😊', 'feliz simpatico'], ['🙂', 'sorriso leve'], ['😉', 'piscada'], ['😍', 'amor coracao olhos'],
      ['😘', 'beijo'], ['🤗', 'abraco'], ['🤝', 'aperto de mao acordo negocio'], ['👍', 'joia positivo ok curtir'],
      ['👎', 'negativo nao'], ['👏', 'palmas parabens'], ['🙏', 'obrigado por favor gratidao'], ['💪', 'forca musculo'],
      ['👋', 'oi tchau ola aceno'], ['✌️', 'paz'], ['🤙', 'chamar'], ['👌', 'ok certo'],
      ['😅', 'riso nervoso'], ['😂', 'chorando de rir'], ['🤣', 'rolando de rir'], ['😎', 'oculos estiloso'],
      ['🤔', 'pensando duvida'], ['😐', 'neutro'], ['😕', 'confuso'], ['😢', 'triste choro'],
      ['😭', 'chorando muito'], ['😠', 'bravo raiva'], ['😱', 'susto medo'], ['🥳', 'festa comemorar'],
      ['😴', 'sono dormindo'], ['🤒', 'doente'], ['🙌', 'maos ao alto comemorar'], ['🫡', 'continencia entendido'],
    ],
  },
  {
    key: 'trabalho', label: 'Trabalho', icon: '📄',
    items: [
      ['✅', 'ok certo feito confirmado'], ['❌', 'errado nao cancelado'], ['⚠️', 'atencao alerta cuidado'],
      ['📌', 'importante fixar'], ['📎', 'anexo clipe'], ['📄', 'documento arquivo'], ['📃', 'documento pagina'],
      ['📑', 'documentos apolice'], ['🧾', 'recibo boleto nota'], ['📅', 'data agenda calendario'],
      ['🗓️', 'agenda calendario'], ['⏰', 'hora alarme prazo'], ['⏳', 'aguardando prazo'],
      ['📞', 'telefone ligacao'], ['📱', 'celular whatsapp'], ['✉️', 'email carta'], ['📧', 'email'],
      ['💬', 'mensagem conversa'], ['🔔', 'aviso notificacao lembrete'], ['🔎', 'buscar consultar'],
      ['📝', 'anotar preencher formulario'], ['✍️', 'assinar assinatura'], ['🖊️', 'caneta assinar'],
      ['📊', 'grafico relatorio'], ['📈', 'subiu aumento'], ['📉', 'caiu queda'], ['🗂️', 'pasta processo'],
      ['🔒', 'seguro protegido'], ['🔑', 'chave acesso'], ['⭐', 'estrela destaque'],
    ],
  },
  {
    key: 'seguros', label: 'Seguros', icon: '🚗',
    items: [
      ['🚗', 'carro auto veiculo'], ['🚙', 'suv carro'], ['🏍️', 'moto'], ['🚐', 'van utilitario'],
      ['🚛', 'caminhao frota'], ['🏠', 'casa residencial imovel'], ['🏢', 'empresa predio empresarial'],
      ['🏥', 'saude hospital'], ['🩺', 'saude medico'], ['💊', 'saude remedio'], ['🐶', 'pet cachorro'],
      ['🐱', 'pet gato'], ['🛡️', 'protecao seguro cobertura'], ['🧯', 'incendio protecao'],
      ['🔧', 'oficina reparo conserto'], ['🛠️', 'oficina manutencao'], ['🚨', 'sinistro emergencia'],
      ['💥', 'colisao batida sinistro'], ['🌧️', 'chuva clima'], ['⛈️', 'temporal granizo'],
      ['💰', 'dinheiro valor premio'], ['💵', 'dinheiro pagamento'], ['💳', 'cartao pagamento'],
      ['🏦', 'banco'], ['🧮', 'calculo cotacao'], ['📋', 'proposta cotacao checklist'],
      ['🤖', 'automacao bot'], ['🎉', 'parabens fechamento'], ['🎯', 'meta objetivo'], ['🔥', 'urgente quente'],
    ],
  },
];

const RECENTS_KEY = 'composer_emoji_recents_v1';
const MAX_RECENTS = 24;

function loadRecents(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter(e => typeof e === 'string').slice(0, MAX_RECENTS) : [];
  } catch { return []; }
}

export function pushRecentEmoji(emoji: string) {
  if (typeof window === 'undefined') return;
  try {
    const next = [emoji, ...loadRecents().filter(e => e !== emoji)].slice(0, MAX_RECENTS);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {}
}

export default function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const [group, setGroup] = useState(GROUPS[0].key);
  const [query, setQuery] = useState('');
  const [recents, setRecents] = useState<string[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setRecents(loadRecents()); }, []);

  // Fecha ao clicar fora ou apertar Esc
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    // timeout: senão o próprio clique que abriu o picker já o fecharia
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    document.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return GROUPS.find(g => g.key === group)!.items;
    return GROUPS.flatMap(g => g.items).filter(([, kw]) => kw.includes(q));
  }, [query, group]);

  function pick(emoji: string) {
    pushRecentEmoji(emoji);
    setRecents(loadRecents());
    onPick(emoji);
  }

  const cell: React.CSSProperties = {
    width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 19, lineHeight: 1, background: 'transparent', border: 'none', borderRadius: 8,
    cursor: 'pointer', padding: 0, transition: 'background 0.12s var(--ease-out)',
  };

  return (
    <div ref={boxRef} className="glass-modal fade-in"
      style={{ position: 'absolute', bottom: 'calc(100% + 10px)', left: 16, zIndex: 95, width: 300, borderRadius: 16, padding: 10 }}>
      <input
        autoFocus value={query} onChange={e => setQuery(e.target.value)}
        placeholder="Buscar emoji…"
        style={{ width: '100%', padding: '6px 11px', marginBottom: 8, background: 'var(--field-bg)', border: '1px solid var(--hairline)', borderRadius: 999, color: 'var(--text-primary)', fontSize: 12, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
      />

      {!query && recents.length > 0 && (
        <>
          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', margin: '2px 0 4px 2px' }}>Recentes</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', marginBottom: 8 }}>
            {recents.map((e, i) => (
              <button key={`r${i}`} onClick={() => pick(e)} style={cell}
                onMouseEnter={ev => (ev.currentTarget.style.background = 'var(--accent-dim)')}
                onMouseLeave={ev => (ev.currentTarget.style.background = 'transparent')}>{e}</button>
            ))}
          </div>
        </>
      )}

      {!query && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 6, borderBottom: '1px solid var(--hairline)', paddingBottom: 6 }}>
          {GROUPS.map(g => (
            <button key={g.key} onClick={() => setGroup(g.key)} title={g.label}
              style={{
                flex: 1, padding: '5px 0', fontSize: 15, lineHeight: 1, cursor: 'pointer', fontFamily: 'inherit',
                background: group === g.key ? 'var(--accent-dim)' : 'transparent',
                border: `1px solid ${group === g.key ? 'rgba(59,130,246,0.35)' : 'transparent'}`,
                borderRadius: 8, transition: 'all 0.15s var(--ease-out)',
              }}>
              {g.icon}
            </button>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', maxHeight: 190, overflowY: 'auto' }}>
        {results.map(([e], i) => (
          <button key={i} onClick={() => pick(e)} style={cell}
            onMouseEnter={ev => (ev.currentTarget.style.background = 'var(--accent-dim)')}
            onMouseLeave={ev => (ev.currentTarget.style.background = 'transparent')}>{e}</button>
        ))}
        {results.length === 0 && (
          <div style={{ gridColumn: '1 / -1', padding: '14px 4px', textAlign: 'center', fontSize: 11.5, color: 'var(--text-muted)' }}>
            Nenhum emoji para "{query}"
          </div>
        )}
      </div>
    </div>
  );
}
