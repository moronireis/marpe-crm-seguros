import { useState, useEffect, useRef, useCallback } from 'react';

interface SurveyStats {
  avg: number;
  total: number;
  completed: number;
  distribution: Record<number, number>;
}

interface ProducerRow {
  producer: string;
  deals: number;
  premio: number;
  comissao: number;
}

interface RenewalPipeline {
  upcoming30: number;
  upcoming60: number;
  upcoming90: number;
  overdue: number;
}

interface ConversionByRamo {
  ramo: string;
  total: number;
  won: number;
  lost: number;
  rate: number;
}

interface ActivityItem {
  id: string;
  deal_id: string;
  type: string;
  description: string;
  created_at: string;
  deal_title: string | null;
  contact_name: string | null;
}

interface AutomationStats {
  total: number;
  active: number;
  executionsToday: number;
}

interface MessageStats {
  sentToday: number;
  receivedToday: number;
  totalConversations: number;
}

interface Stats {
  totalContacts: number;
  totalDeals: number;
  totalPremio: number;
  totalComissao: number;
  ramoBreakdown: Record<string, number>;
  dealTypeBreakdown: Record<string, number>;
  surveyStats?: SurveyStats;
  producerPerformance?: ProducerRow[];
  renewalPipeline?: RenewalPipeline;
  conversionByRamo?: ConversionByRamo[];
  recentActivity?: ActivityItem[];
  automationStats?: AutomationStats;
  messageStats?: MessageStats;
}

interface GoalRow {
  id: string;
  producer_name: string;
  month: number;
  year: number;
  target_premio: number;
  target_deals: number;
  actual_premio: number;
  actual_deals: number;
  pct_premio: number | null;
  pct_deals: number | null;
}

interface EditState {
  target_premio: string;
  target_deals: string;
}

function formatK(n: number): string {
  if (n >= 1000000) return `R$ ${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `R$ ${(n / 1000).toFixed(0)}K`;
  return `R$ ${n.toFixed(0)}`;
}

const DEAL_TYPE_LABELS: Record<string, string> = {
  prospeccao: 'Prospecção',
  renovacao: 'Renovação',
};

const RAMO_COLORS: Record<string, string> = {
  auto: 'var(--accent)', vida: 'var(--purple)', residencial: 'var(--green)',
  empresarial: 'var(--amber)', equipamento: 'var(--cyan)', vgrp: 'var(--purple)',
  fina: 'var(--red)', rcge: 'var(--amber)',
};

function formatCurrency(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function progressColor(pct: number | null): string {
  if (pct === null) return 'var(--accent)';
  if (pct >= 80) return 'var(--green)';
  if (pct >= 50) return 'var(--amber)';
  return 'var(--red)';
}

function ProgressBar({ pct, color }: { pct: number | null; color: string }) {
  const clamped = Math.min(pct ?? 0, 100);
  return (
    <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 99, overflow: 'hidden' }}>
      <div style={{
        height: '100%',
        width: `${clamped}%`,
        background: color,
        borderRadius: 99,
        transition: 'width 0.4s ease',
      }} />
    </div>
  );
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m atrás`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h atrás`;
  return `${Math.floor(hrs / 24)}d atrás`;
}

const ACTIVITY_ICONS: Record<string, { d: string; color: string }> = {
  stage_change: { d: 'M3 8l4 4 6-6',                                           color: 'var(--accent)' },
  note:         { d: 'M4 2h8v12H4zM7 2v12M4 7h8',                              color: 'var(--amber)' },
  message_sent: { d: 'M2 4h12v8H2zM2 4l6 5 6-5',                              color: 'var(--green)' },
  field_update: { d: 'M3 13l2-2 6-6 2 2-6 6zM11 3l2 2',                       color: 'var(--purple)' },
  assignment:   { d: 'M8 3a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM3 13c0-2.5 2.2-4 5-4s5 1.5 5 4', color: 'var(--cyan)' },
  creation:     { d: 'M8 2v12M2 8h12',                                         color: 'var(--green)' },
  loss:         { d: 'M3 3l10 10M13 3L3 13',                                   color: 'var(--red)' },
};

// ─── ExportMenu ───────────────────────────────────────────────────────────────
function ExportMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function download(url: string) {
    setOpen(false);
    window.open(url, '_blank');
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          padding: '7px 14px', borderRadius: 6,
          border: '1px solid var(--border)', background: 'var(--bg-card)',
          color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer',
          fontFamily: 'inherit', fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path d="M6.5 1v8M3.5 6l3 3 3-3M1.5 11h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Exportar
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ opacity: 0.5 }}>
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 200,
          background: 'var(--bg-secondary)', border: '1px solid var(--border)',
          borderRadius: 8, minWidth: 180, boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
          overflow: 'hidden',
        }}>
          {[
            { label: 'Negócios (CSV)', url: '/api/export/deals?format=csv' },
            { label: 'Contatos (CSV)', url: '/api/export/contacts?format=csv' },
          ].map(item => (
            <button
              key={item.url}
              onClick={() => download(item.url)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '10px 14px', background: 'transparent',
                border: 'none', color: 'var(--text-secondary)',
                fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DashboardView() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const now = new Date();
  const [goalMonth, setGoalMonth] = useState(now.getMonth() + 1);
  const [goalYear, setGoalYear] = useState(now.getFullYear());
  const [goals, setGoals] = useState<GoalRow[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editMap, setEditMap] = useState<Record<string, EditState>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/dashboard/stats')
      .then(r => r.json())
      .then(d => { setStats(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const fetchGoals = useCallback(() => {
    setGoalsLoading(true);
    fetch(`/api/goals?month=${goalMonth}&year=${goalYear}`)
      .then(r => r.json())
      .then(d => { setGoals(d.goals || []); setGoalsLoading(false); })
      .catch(() => setGoalsLoading(false));
  }, [goalMonth, goalYear]);

  useEffect(() => { fetchGoals(); }, [fetchGoals]);

  const padX = isMobile ? 14 : 32;
  const padStyle = { padding: `24px ${padX}px` };

  if (loading) return (
    <div style={padStyle}>
      <h1 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700 }}>Dashboard</h1>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>Carregando dados reais da Marpe...</p>
    </div>
  );

  if (!stats) return (
    <div style={padStyle}>
      <h1 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700 }}>Dashboard</h1>
      <p style={{ fontSize: 13, color: 'var(--red)', marginTop: 8 }}>Erro ao carregar dados.</p>
    </div>
  );

  const kpis = [
    { label: 'Clientes na carteira', value: stats.totalContacts.toLocaleString('pt-BR'), color: 'var(--accent)' },
    { label: 'Negócios / pólices', value: stats.totalDeals.toLocaleString('pt-BR'), color: 'var(--green)' },
    { label: 'Prêmio total', value: formatK(stats.totalPremio), color: 'var(--amber)' },
    { label: 'Comissão estimada', value: formatK(stats.totalComissao), color: 'var(--purple)' },
  ];

  // Top ramos by count
  const ramoEntries = Object.entries(stats.ramoBreakdown).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxRamo = ramoEntries[0]?.[1] || 1;

  return (
    <div style={{ padding: `24px ${padX}px`, overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, letterSpacing: '-0.02em' }}>Dashboard</h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Dados reais sincronizados da Corp &mdash; Marpe Corretora</p>
        </div>
        <ExportMenu />
      </div>

      {/* KPIs — 4 cols desktop, 2 cols tablet, 1 col mobile */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? 10 : 14, marginTop: 20 }}>
        {kpis.map(s => (
          <div key={s.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: isMobile ? 14 : 20 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{s.label}</div>
            <div style={{ fontSize: isMobile ? 22 : 28, fontWeight: 700, color: s.color, marginTop: 8, letterSpacing: '-0.02em' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Row 2: Ramo breakdown + Deal types */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: isMobile ? 10 : 14, marginTop: isMobile ? 10 : 14 }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Negócios por ramo</h4>
          {ramoEntries.map(([ramo, count]) => (
            <div key={ramo} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', width: 100, flexShrink: 0, textTransform: 'uppercase' }}>{ramo}</span>
              <div style={{ flex: 1, height: 20, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(count / maxRamo) * 100}%`, background: RAMO_COLORS[ramo.toLowerCase()] || 'var(--accent)', borderRadius: 4 }} />
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 40, textAlign: 'right' }}>{count}</span>
            </div>
          ))}
        </div>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Tipo de negócio</h4>
          {Object.entries(stats.dealTypeBreakdown).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
            <div key={type} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(26,26,42,0.3)' }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{DEAL_TYPE_LABELS[type] || type}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Row 3: Satisfação */}
      {stats.surveyStats && (
        <div style={{ marginTop: 14 }}>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h4 style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>Satisfação dos clientes</h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {stats.surveyStats.completed}/{stats.surveyStats.total} respondidas
                </span>
                <div style={{
                  fontSize: 22, fontWeight: 700, color: 'var(--amber)', letterSpacing: '-0.02em',
                  display: 'flex', alignItems: 'baseline', gap: 4,
                }}>
                  {stats.surveyStats.completed > 0 ? stats.surveyStats.avg.toFixed(1) : '—'}
                  {stats.surveyStats.completed > 0 && (
                    <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 400 }}>/5</span>
                  )}
                </div>
                {/* Star display */}
                {stats.surveyStats.completed > 0 && (
                  <div style={{ display: 'flex', gap: 2 }}>
                    {[1, 2, 3, 4, 5].map(star => (
                      <svg key={star} width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path
                          d="M7 1l1.545 3.13L12 4.635l-2.5 2.435.59 3.43L7 8.895l-3.09 1.605.59-3.43L2 4.635l3.455-.505L7 1z"
                          fill={star <= Math.round(stats.surveyStats!.avg) ? 'var(--amber)' : 'var(--border)'}
                        />
                      </svg>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {/* Distribution bars 1–5 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[5, 4, 3, 2, 1].map(star => {
                const count = stats.surveyStats!.distribution[star] || 0;
                const maxDist = Math.max(...Object.values(stats.surveyStats!.distribution), 1);
                return (
                  <div key={star} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)', width: 14, textAlign: 'right', flexShrink: 0 }}>{star}</span>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                      <path
                        d="M6 0.5l1.3 2.64L10.5 3.6l-2.25 2.19.53 3.09L6 7.55l-2.78 1.33.53-3.09L1.5 3.6l3.2-.46L6 0.5z"
                        fill="var(--amber)"
                      />
                    </svg>
                    <div style={{ flex: 1, height: 16, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${(count / maxDist) * 100}%`,
                        background: 'var(--amber)',
                        borderRadius: 3,
                        transition: 'width 0.4s ease',
                      }} />
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 24, textAlign: 'right', flexShrink: 0 }}>{count}</span>
                  </div>
                );
              })}
            </div>
            {stats.surveyStats.total === 0 && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '8px 0 0' }}>
                Nenhuma pesquisa enviada ainda. Configure uma automação do tipo "Enviar pesquisa" para começar.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ─── Metas por Produtor ──────────────────────────────────────────── */}
      <GoalsSection
        stats={stats}
        goalMonth={goalMonth}
        goalYear={goalYear}
        goals={goals}
        goalsLoading={goalsLoading}
        editing={editing}
        editMap={editMap}
        saving={saving}
        setGoalMonth={setGoalMonth}
        setGoalYear={setGoalYear}
        setEditing={setEditing}
        setEditMap={setEditMap}
        setSaving={setSaving}
        fetchGoals={fetchGoals}
      />

      {/* ─── NEW: Renewal Pipeline ───────────────────────────────────────── */}
      {stats.renewalPipeline && (
        <div style={{ marginTop: 14 }}>
          <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--text-primary)' }}>Pipeline de renovações</h4>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: isMobile ? 10 : 14 }}>
            {[
              { label: 'Próximos 30d', value: stats.renewalPipeline.upcoming30, color: 'var(--green)' },
              { label: 'Próximos 60d', value: stats.renewalPipeline.upcoming60, color: 'var(--accent)' },
              { label: 'Próximos 90d', value: stats.renewalPipeline.upcoming90, color: 'var(--amber)' },
              { label: 'Vencidos',     value: stats.renewalPipeline.overdue,    color: 'var(--red)' },
            ].map(card => (
              <div key={card.label} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderTop: `2px solid ${card.color}`,
                borderRadius: 12, padding: 16,
              }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{card.label}</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: card.color, marginTop: 8, letterSpacing: '-0.02em' }}>{card.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── NEW: Conversion by Ramo ─────────────────────────────────────── */}
      {stats.conversionByRamo && stats.conversionByRamo.length > 0 && (() => {
        const convRamo = stats.conversionByRamo!;
        const maxConvTotal = convRamo[0]?.total || 1;
        return (
          <div style={{ marginTop: 14 }}>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
              <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Conversão por ramo (estágios finais)</h4>
              {convRamo.map(item => (
                <div key={item.ramo} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {item.ramo}
                    </span>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <span style={{ fontSize: 11, color: 'var(--green)' }}>{item.won} ganhos</span>
                      <span style={{ fontSize: 11, color: 'var(--red)' }}>{item.lost} perdidos</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: item.rate >= 50 ? 'var(--green)' : 'var(--amber)' }}>
                        {item.rate}%
                      </span>
                    </div>
                  </div>
                  <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
                    <div style={{
                      width: `${(item.won / maxConvTotal) * 100}%`,
                      background: 'var(--green)', borderRadius: '4px 0 0 4px',
                      transition: 'width 0.4s ease',
                    }} />
                    <div style={{
                      width: `${(item.lost / maxConvTotal) * 100}%`,
                      background: 'var(--red)',
                      transition: 'width 0.4s ease',
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ─── NEW: Recent Activity + Operations ───────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: isMobile ? 10 : 14, marginTop: isMobile ? 10 : 14 }}>

        {/* Activity Feed */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
          <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Atividade recente</h4>
          {(!stats.recentActivity || stats.recentActivity.length === 0) ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Nenhuma atividade registrada.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {stats.recentActivity.map((act, i) => {
                const icon = ACTIVITY_ICONS[act.type] || ACTIVITY_ICONS['note'];
                const isLast = i === stats.recentActivity!.length - 1;
                return (
                  <div key={act.id} style={{ display: 'flex', gap: 12, position: 'relative' }}>
                    {!isLast && (
                      <div style={{
                        position: 'absolute', left: 14, top: 30, bottom: 0,
                        width: 1, background: 'var(--border)',
                      }} />
                    )}
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                      background: 'var(--bg-secondary)', border: `1px solid ${icon.color}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      marginTop: 2,
                    }}>
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                        <path d={icon.d} stroke={icon.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                    <div style={{ flex: 1, paddingBottom: isLast ? 0 : 14 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.4 }}>{act.description}</div>
                      {(act.deal_title || act.contact_name) && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                          {act.contact_name && <span>{act.contact_name}</span>}
                          {act.contact_name && act.deal_title && <span style={{ opacity: 0.4 }}> · </span>}
                          {act.deal_title && <span style={{ opacity: 0.7 }}>{act.deal_title}</span>}
                        </div>
                      )}
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3, opacity: 0.6 }}>{timeAgo(act.created_at)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Operations column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Automations */}
          {stats.automationStats && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M8 1v3M8 12v3M1 8h3M12 8h3M3.5 3.5l2.1 2.1M10.4 10.4l2.1 2.1M3.5 12.5l2.1-2.1M10.4 5.6l2.1-2.1" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
                <h4 style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>Automações</h4>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Ativas</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)' }}>{stats.automationStats.active} / {stats.automationStats.total}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Execuções hoje</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>{stats.automationStats.executionsToday}</span>
                </div>
              </div>
            </div>
          )}

          {/* Messages */}
          {stats.messageStats && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M2 3h12v8H2zM2 3l6 5 6-5" stroke="var(--green)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <h4 style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>Mensagens</h4>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Enviadas hoje</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)' }}>{stats.messageStats.sentToday}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Recebidas hoje</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>{stats.messageStats.receivedToday}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Conversas ativas</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{stats.messageStats.totalConversations}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Source info */}
      <div style={{ marginTop: 20, padding: '12px 16px', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)', borderRadius: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>Dados sincronizados da Corp (Agia) &mdash; {stats.totalContacts} clientes, {stats.totalDeals} negócios/pólices</span>
      </div>
    </div>
  );
}

// ─── GoalsSection (extracted to keep DashboardView readable) ─────────────────
interface GoalsSectionProps {
  stats: Stats;
  goalMonth: number;
  goalYear: number;
  goals: GoalRow[];
  goalsLoading: boolean;
  editing: boolean;
  editMap: Record<string, EditState>;
  saving: boolean;
  setGoalMonth: (m: number) => void;
  setGoalYear: (y: number) => void;
  setEditing: (v: boolean) => void;
  setEditMap: React.Dispatch<React.SetStateAction<Record<string, EditState>>>;
  setSaving: (v: boolean) => void;
  fetchGoals: () => void;
}

function GoalsSection({
  stats, goalMonth, goalYear, goals, goalsLoading,
  editing, editMap, saving,
  setGoalMonth, setGoalYear, setEditing, setEditMap, setSaving, fetchGoals,
}: GoalsSectionProps) {
  const now = new Date();
  const yearOptions = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  // All known producers: union of goals + stats performance
  const allProducers = Array.from(new Set([
    ...(stats.producerPerformance?.map(p => p.producer) || []),
    ...goals.map(g => g.producer_name),
  ])).sort();

  const goalsByProducer = Object.fromEntries(goals.map(g => [g.producer_name, g]));

  // Merged view: goal rows enriched with actuals; producers without goals show actuals only
  const mergedProducers: GoalRow[] = allProducers.map(producer => {
    const goal = goalsByProducer[producer];
    const perf = stats.producerPerformance?.find(p => p.producer === producer);
    if (goal) return goal;
    return {
      id: '',
      producer_name: producer,
      month: goalMonth,
      year: goalYear,
      target_premio: 0,
      target_deals: 0,
      actual_premio: perf?.premio || 0,
      actual_deals: perf?.deals || 0,
      pct_premio: null,
      pct_deals: null,
    };
  });

  function openEditor() {
    const map: Record<string, EditState> = {};
    for (const producer of allProducers) {
      const existing = goalsByProducer[producer];
      map[producer] = {
        target_premio: existing ? String(existing.target_premio) : '',
        target_deals: existing ? String(existing.target_deals) : '',
      };
    }
    if (allProducers.length === 0) {
      map['_new_init'] = { target_premio: '', target_deals: '' };
    }
    setEditMap(map);
    setEditing(true);
  }

  function closeEditor() {
    setEditing(false);
    setEditMap({});
  }

  function updateEditKey(oldKey: string, newKey: string) {
    setEditMap(prev => {
      const next = { ...prev };
      const val = next[oldKey];
      delete next[oldKey];
      next[newKey] = val;
      return next;
    });
  }

  async function saveGoals() {
    setSaving(true);
    const entries = Object.entries(editMap).filter(([name]) => name.trim() && !name.startsWith('_new_'));
    await Promise.all(entries.map(([producer_name, vals]) =>
      fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          producer_name,
          month: goalMonth,
          year: goalYear,
          target_premio: parseFloat(vals.target_premio) || 0,
          target_deals: parseInt(vals.target_deals) || 0,
        }),
      })
    ));
    setSaving(false);
    closeEditor();
    fetchGoals();
  }

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginTop: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h4 style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>Metas por Produtor</h4>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select
            value={goalMonth}
            onChange={e => setGoalMonth(Number(e.target.value))}
            style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6,
              color: 'var(--text-primary)', fontSize: 12, padding: '4px 8px', cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {MONTH_NAMES.map((name, i) => (
              <option key={i + 1} value={i + 1}>{name}</option>
            ))}
          </select>
          <select
            value={goalYear}
            onChange={e => setGoalYear(Number(e.target.value))}
            style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6,
              color: 'var(--text-primary)', fontSize: 12, padding: '4px 8px', cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {!editing && (
            <button
              onClick={openEditor}
              style={{
                background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)',
                borderRadius: 6, color: 'var(--accent)', fontSize: 12, fontWeight: 600,
                padding: '4px 12px', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Editar metas
            </button>
          )}
        </div>
      </div>

      {/* Inline editor */}
      {editing && (
        <div style={{
          background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.2)',
          borderRadius: 8, padding: 16, marginBottom: 16,
        }}>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            Definir metas — {MONTH_NAMES[goalMonth - 1]} {goalYear}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 120px', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Produtor</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Meta prêmio (R$)</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Meta negócios</span>
          </div>
          {Object.entries(editMap).map(([key, vals]) => (
            <div key={key} style={{ display: 'grid', gridTemplateColumns: '1fr 160px 120px', gap: 8, marginBottom: 8 }}>
              <input
                type="text"
                placeholder="Nome do produtor"
                defaultValue={key.startsWith('_new_') ? '' : key}
                onBlur={e => {
                  const newKey = e.target.value.trim();
                  if (newKey && newKey !== key) updateEditKey(key, newKey);
                  else if (!newKey && key.startsWith('_new_')) {
                    setEditMap(prev => { const n = { ...prev }; delete n[key]; return n; });
                  }
                }}
                style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6,
                  color: 'var(--text-primary)', fontSize: 13, padding: '6px 10px', fontFamily: 'inherit',
                }}
              />
              <input
                type="number"
                placeholder="0"
                value={vals.target_premio}
                onChange={e => setEditMap(prev => ({ ...prev, [key]: { ...prev[key], target_premio: e.target.value } }))}
                style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6,
                  color: 'var(--text-primary)', fontSize: 13, padding: '6px 10px', fontFamily: 'inherit',
                }}
              />
              <input
                type="number"
                placeholder="0"
                value={vals.target_deals}
                onChange={e => setEditMap(prev => ({ ...prev, [key]: { ...prev[key], target_deals: e.target.value } }))}
                style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6,
                  color: 'var(--text-primary)', fontSize: 13, padding: '6px 10px', fontFamily: 'inherit',
                }}
              />
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              onClick={() => setEditMap(prev => ({ ...prev, ['_new_' + Date.now()]: { target_premio: '', target_deals: '' } }))}
              style={{
                background: 'transparent', border: '1px dashed var(--border)',
                borderRadius: 6, color: 'var(--text-muted)', fontSize: 12,
                padding: '4px 12px', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              + Adicionar produtor
            </button>
            <button
              onClick={saveGoals}
              disabled={saving}
              style={{
                background: 'var(--accent)', border: 'none', borderRadius: 6,
                color: '#fff', fontSize: 12, fontWeight: 600, padding: '4px 16px',
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
                fontFamily: 'inherit',
              }}
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
            <button
              onClick={closeEditor}
              style={{
                background: 'transparent', border: '1px solid var(--border)', borderRadius: 6,
                color: 'var(--text-muted)', fontSize: 12, padding: '4px 12px',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Goals list */}
      {goalsLoading ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Carregando metas...</p>
      ) : mergedProducers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nenhuma meta definida para {MONTH_NAMES[goalMonth - 1]} {goalYear}.</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Clique em "Editar metas" para começar.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mergedProducers.map(row => {
            const hasGoal = row.target_premio > 0 || row.target_deals > 0;
            const colorPremio = progressColor(row.pct_premio);
            const colorDeals = progressColor(row.pct_deals);
            return (
              <div
                key={row.producer_name}
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '14px 16px',
                }}
              >
                {/* Name + badge */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {row.producer_name}
                  </span>
                  {hasGoal && row.pct_premio !== null && (
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: colorPremio,
                      background: `${colorPremio}18`,
                      border: `1px solid ${colorPremio}40`,
                      borderRadius: 99, padding: '2px 8px',
                    }}>
                      {row.pct_premio}% da meta
                    </span>
                  )}
                </div>

                {/* Prêmio */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Prêmio</span>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {formatCurrency(row.actual_premio)}
                      {hasGoal && row.target_premio > 0 && (
                        <span style={{ color: 'var(--text-muted)' }}> / {formatCurrency(row.target_premio)}</span>
                      )}
                    </span>
                  </div>
                  {hasGoal && row.target_premio > 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ProgressBar pct={row.pct_premio} color={colorPremio} />
                      <span style={{ fontSize: 11, color: colorPremio, fontWeight: 600, minWidth: 36, textAlign: 'right' }}>
                        {row.pct_premio ?? 0}%
                      </span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Sem meta definida</div>
                  )}
                </div>

                {/* Negócios */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Negócios</span>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {row.actual_deals}
                      {hasGoal && row.target_deals > 0 && (
                        <span style={{ color: 'var(--text-muted)' }}> / {row.target_deals}</span>
                      )}
                    </span>
                  </div>
                  {hasGoal && row.target_deals > 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <ProgressBar pct={row.pct_deals} color={colorDeals} />
                      <span style={{ fontSize: 11, color: colorDeals, fontWeight: 600, minWidth: 36, textAlign: 'right' }}>
                        {row.pct_deals ?? 0}%
                      </span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Sem meta definida</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
