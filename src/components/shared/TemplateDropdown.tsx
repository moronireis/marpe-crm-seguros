import { useState, useEffect } from 'react';

export interface Template {
  id: string;
  name: string;
  shortcut: string | null;
  category: string | null;
  body: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  assistencia: 'Assistência', cobranca: 'Cobrança', comercial: 'Comercial',
  marketing: 'Marketing', 'pos-venda': 'Pós-venda', relacionamento: 'Relacionamento',
  renovacao: 'Renovação', sinistro: 'Sinistro',
};

export function useTemplates(): Template[] {
  const [templates, setTemplates] = useState<Template[]>([]);
  useEffect(() => {
    fetch('/api/templates')
      .then(r => r.json())
      .then(d => setTemplates(d.templates || []))
      .catch(() => {});
  }, []);
  return templates;
}

export function filterTemplates(templates: Template[], filter: string): Template[] {
  if (!filter) return templates;
  const q = filter.toLowerCase();
  return templates.filter(t =>
    t.name.toLowerCase().includes(q) ||
    (t.shortcut?.toLowerCase().replace('/', '').includes(q)) ||
    (t.category?.toLowerCase().includes(q))
  );
}

/**
 * Ordem achatada exatamente igual à que o dropdown renderiza (agrupada por
 * categoria). O componente pai usa isto para navegar com as setas — se as duas
 * ordens divergirem, o Enter seleciona um template diferente do destacado.
 * (S1 #7, 27/07)
 */
export function orderedTemplates(templates: Template[], filter: string): Template[] {
  const filtered = filterTemplates(templates, filter);
  const grouped: Record<string, Template[]> = {};
  for (const t of filtered) {
    const cat = t.category || 'outros';
    (grouped[cat] ||= []).push(t);
  }
  return Object.values(grouped).flat();
}

export default function TemplateDropdown({ visible, filter, templates, onSelect, left = 12, right = 12, activeId, onHover, previewOf }: {
  visible: boolean;
  filter: string; // without leading '/'
  templates: Template[];
  onSelect: (t: Template) => void;
  left?: number;
  right?: number;
  /** S1 #7: id do item destacado pelo teclado */
  activeId?: string | null;
  /** S1 #7: sincroniza o destaque quando o mouse passa por cima */
  onHover?: (t: Template) => void;
  /** S1 #7: resolve as variáveis para o preview ({{nome}} → "João") */
  previewOf?: (body: string) => string;
}) {
  if (!visible) return null;

  const filtered = filterTemplates(templates, filter);
  const boxStyle: React.CSSProperties = {
    position: 'absolute', bottom: 'calc(100% + 10px)', left, right, zIndex: 90,
    borderRadius: 16,
  };

  if (templates.length === 0) {
    return (
      <div className="glass-modal fade-in" style={{ ...boxStyle, padding: '16px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Nenhum template cadastrado</div>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="glass-modal fade-in" style={{ ...boxStyle, padding: '16px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Nenhum template encontrado para "/{filter}"</div>
      </div>
    );
  }

  const grouped: Record<string, Template[]> = {};
  for (const t of filtered) {
    const cat = t.category || 'outros';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(t);
  }

  return (
    <div className="glass-modal fade-in" style={{ ...boxStyle, maxHeight: 340, overflowY: 'auto', padding: '6px 0' }}>
      <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1 }}>Templates {filter && `· "${filter}"`}</span>
        <span style={{ fontSize: 9.5, fontWeight: 500, textTransform: 'none', letterSpacing: 0, opacity: 0.75 }}>↑↓ navegar · Enter usar · Esc sair</span>
      </div>
      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat}>
          <div style={{ padding: '6px 14px 2px', fontSize: 10, fontWeight: 600, color: 'var(--accent-light)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {CATEGORY_LABELS[cat] || cat}
          </div>
          {items.map(t => {
            const on = activeId === t.id;
            // S1 #7: a prévia mostra o texto COM as variáveis já substituídas —
            // era o pedido explícito ("validar se as variáveis estão corretas").
            const preview = previewOf ? previewOf(t.body) : t.body;
            return (
              <div key={t.id} onClick={() => onSelect(t)}
                ref={el => { if (on && el) el.scrollIntoView({ block: 'nearest' }); }}
                style={{ padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.15s var(--ease-out)', background: on ? 'var(--accent-dim)' : 'transparent', borderLeft: `2px solid ${on ? 'var(--accent)' : 'transparent'}` }}
                onMouseEnter={() => onHover?.(t)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
                    {preview.slice(0, 80)}{preview.length > 80 ? '…' : ''}
                  </div>
                </div>
                {t.shortcut && (
                  <span style={{ fontSize: 10, color: 'var(--accent-light)', background: 'var(--accent-dim)', padding: '2px 8px', borderRadius: 6, flexShrink: 0, fontFamily: 'monospace' }}>{t.shortcut}</span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
