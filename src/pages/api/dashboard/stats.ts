import type { APIRoute } from 'astro';
import { requireAuth } from '../../../lib/api-auth';
import { createServerClient } from '../../../lib/supabase-server';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const profile = requireAuth(locals);
  if (profile instanceof Response) return profile;

  const sb = createServerClient();

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const in30 = new Date(today); in30.setDate(today.getDate() + 30);
  const in60 = new Date(today); in60.setDate(today.getDate() + 60);
  const in90 = new Date(today); in90.setDate(today.getDate() + 90);
  const in30Str = in30.toISOString().slice(0, 10);
  const in60Str = in60.toISOString().slice(0, 10);
  const in90Str = in90.toISOString().slice(0, 10);

  const [
    contactsRes,
    dealsRes,
    funnelsRes,
    stagesRes,
    surveysRes,
    activitiesRes,
    automationsRes,
    automationLogsRes,
    messagesOutRes,
    messagesInRes,
    conversationsRes,
  ] = await Promise.all([
    sb.from('marpe_contacts').select('id', { count: 'exact', head: true }),
    sb.from('marpe_deals').select('id, ramo, premio, comissao_valor, deal_type, seguradora, funnel_id, stage_id, produtor, vigencia_fim, title, contact_id'),
    sb.from('marpe_funnels').select('id, name, marpe_funnel_stages(id, name, color, sort_order)').eq('is_active', true).order('sort_order'),
    sb.from('marpe_funnel_stages').select('id, is_terminal, terminal_type'),
    sb.from('marpe_surveys').select('id, status, rating'),
    sb.from('marpe_deal_activities')
      .select('id, deal_id, type, description, created_at, marpe_deals(title, marpe_contacts(name))')
      .order('created_at', { ascending: false })
      .limit(10),
    sb.from('marpe_automations').select('id, is_active'),
    sb.from('marpe_automation_logs').select('id', { count: 'exact', head: true }).gte('created_at', `${todayStr}T00:00:00Z`),
    sb.from('marpe_messages').select('id', { count: 'exact', head: true }).eq('direction', 'outbound').gte('created_at', `${todayStr}T00:00:00Z`),
    sb.from('marpe_messages').select('id', { count: 'exact', head: true }).eq('direction', 'inbound').gte('created_at', `${todayStr}T00:00:00Z`),
    sb.from('marpe_messages').select('contact_id').gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString()),
  ]);

  const deals = dealsRes.data || [];
  const totalContacts = contactsRes.count || 0;
  const totalDeals = deals.length;

  // Build stage terminal map
  const stageMap: Record<string, { is_terminal: boolean; terminal_type: string | null }> = {};
  for (const s of (stagesRes.data || [])) {
    stageMap[s.id] = { is_terminal: s.is_terminal, terminal_type: s.terminal_type };
  }

  // Core aggregates
  let totalPremio = 0;
  let totalComissao = 0;
  const ramoBreakdown: Record<string, number> = {};
  const dealTypeBreakdown: Record<string, number> = {};
  const producerMap: Record<string, { deals: number; premio: number; comissao: number }> = {};
  const ramoConversion: Record<string, { total: number; won: number; lost: number }> = {};

  // Renewal pipeline counts
  let upcoming30 = 0;
  let upcoming60 = 0;
  let upcoming90 = 0;
  let overdue = 0;

  for (const d of deals) {
    if (d.premio) totalPremio += Number(d.premio);
    if (d.comissao_valor) totalComissao += Number(d.comissao_valor);
    if (d.ramo) ramoBreakdown[d.ramo] = (ramoBreakdown[d.ramo] || 0) + 1;
    if (d.deal_type) dealTypeBreakdown[d.deal_type] = (dealTypeBreakdown[d.deal_type] || 0) + 1;

    // Producer performance
    if (d.produtor) {
      if (!producerMap[d.produtor]) producerMap[d.produtor] = { deals: 0, premio: 0, comissao: 0 };
      producerMap[d.produtor].deals++;
      if (d.premio) producerMap[d.produtor].premio += Number(d.premio);
      if (d.comissao_valor) producerMap[d.produtor].comissao += Number(d.comissao_valor);
    }

    // Renewal pipeline — only deals with vigencia_fim
    if (d.vigencia_fim) {
      const vf = d.vigencia_fim as string;
      if (vf < todayStr) {
        overdue++;
      } else if (vf <= in30Str) {
        upcoming30++;
      } else if (vf <= in60Str) {
        upcoming60++;
      } else if (vf <= in90Str) {
        upcoming90++;
      }
    }

    // Conversion by ramo — only terminal stage deals
    if (d.ramo && d.stage_id && stageMap[d.stage_id]?.is_terminal) {
      const ramo = d.ramo;
      if (!ramoConversion[ramo]) ramoConversion[ramo] = { total: 0, won: 0, lost: 0 };
      ramoConversion[ramo].total++;
      if (stageMap[d.stage_id].terminal_type === 'won') ramoConversion[ramo].won++;
      if (stageMap[d.stage_id].terminal_type === 'lost') ramoConversion[ramo].lost++;
    }
  }

  // Format producer performance sorted by premio desc
  const producerPerformance = Object.entries(producerMap)
    .map(([producer, v]) => ({ producer, ...v }))
    .sort((a, b) => b.premio - a.premio);

  // Format conversion by ramo with rate
  const conversionByRamo = Object.entries(ramoConversion)
    .map(([ramo, v]) => ({
      ramo,
      total: v.total,
      won: v.won,
      lost: v.lost,
      rate: v.total > 0 ? Math.round((v.won / v.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  // Recent activity — flatten nested join data
  const recentActivity = (activitiesRes.data || []).map((a: any) => ({
    id: a.id,
    deal_id: a.deal_id,
    type: a.type,
    description: a.description,
    created_at: a.created_at,
    deal_title: a.marpe_deals?.title ?? null,
    contact_name: a.marpe_deals?.marpe_contacts?.name ?? null,
  }));

  // Automation stats
  const allAutomations = automationsRes.data || [];
  const automationStats = {
    total: allAutomations.length,
    active: allAutomations.filter(a => a.is_active).length,
    executionsToday: automationLogsRes.count || 0,
  };

  // Message stats — unique contacts messaged in last 7d = active conversations
  const convContacts = new Set((conversationsRes.data || []).map((m: any) => m.contact_id));
  const messageStats = {
    sentToday: messagesOutRes.count || 0,
    receivedToday: messagesInRes.count || 0,
    totalConversations: convContacts.size,
  };

  // Survey stats (preserved from existing)
  const allSurveys = surveysRes.data || [];
  const completedSurveys = allSurveys.filter(s => s.status === 'completed' && s.rating != null);
  const surveyDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let ratingSum = 0;
  for (const s of completedSurveys) {
    ratingSum += s.rating;
    surveyDistribution[s.rating] = (surveyDistribution[s.rating] || 0) + 1;
  }
  const surveyStats = {
    avg: completedSurveys.length > 0 ? Math.round((ratingSum / completedSurveys.length) * 10) / 10 : 0,
    total: allSurveys.length,
    completed: completedSurveys.length,
    distribution: surveyDistribution,
  };

  return new Response(JSON.stringify({
    totalContacts,
    totalDeals,
    totalPremio,
    totalComissao,
    ramoBreakdown,
    dealTypeBreakdown,
    funnels: funnelsRes.data,
    producerPerformance,
    surveyStats,
    renewalPipeline: { upcoming30, upcoming60, upcoming90, overdue },
    conversionByRamo,
    recentActivity,
    automationStats,
    messageStats,
  }), { status: 200 });
};
