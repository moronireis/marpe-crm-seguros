import { createServerClient } from '../supabase-server';
import { listClientes, getCliente, listDocumentos, listNegociosAndamento, getNegocio, listRamos, listProdutores } from './client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CorpNegocio, CorpNegocioDetail } from './types';

function formatPhone(ddd: number | null, numero: string | null): string | null {
  if (!numero) return null;
  const clean = String(numero).replace(/\D/g, '');
  if (!clean) return null;
  const prefix = ddd ? String(ddd) : '55';
  return `(${prefix}) ${clean}`;
}

function parseCorpDate(d: string | null): string | null {
  if (!d) return null;
  const parts = d.split('/');
  if (parts.length !== 3) return null;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

export interface SyncResult {
  type: string;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export async function syncClientes(): Promise<SyncResult> {
  const sb = createServerClient();
  const result: SyncResult = { type: 'contacts', created: 0, updated: 0, skipped: 0, errors: [] };

  const { clientes } = await listClientes('');

  // Load ALL corp_sync contacts (paginated — Supabase default limit is 1000)
  const existingMap = new Map<string, string>();
  let page = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data: rows } = await sb
      .from('marpe_contacts')
      .select('id, corp_id')
      .eq('source', 'corp_sync')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    for (const r of (rows || [])) existingMap.set(r.corp_id, r.id);
    if (!rows || rows.length < PAGE_SIZE) break;
    page++;
  }

  // Separate into existing (bulk update) and new (fetch detail + insert)
  const toUpdate: Array<{ id: string; name: string; phone: string | null; corp_id: string }> = [];
  const toInsert: typeof clientes = [];

  for (const c of clientes) {
    if (!c.nome || !c.nome.trim()) { result.skipped++; continue; }
    const corpId = String(c.codigo);
    if (existingMap.has(corpId)) {
      toUpdate.push({ id: existingMap.get(corpId)!, name: c.nome, phone: formatPhone(c.ddd, c.numero), corp_id: corpId });
    } else {
      toInsert.push(c);
    }
  }

  // Bulk-update existing in batches of 50 (parallel within batch)
  const BATCH = 50;
  for (let i = 0; i < toUpdate.length; i += BATCH) {
    const batch = toUpdate.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(u => {
        // Never overwrite an existing phone with null — only update when Corp has a value
        const upd: Record<string, any> = { name: u.name };
        if (u.phone) upd.phone = u.phone;
        return sb.from('marpe_contacts').update(upd).eq('id', u.id);
      })
    );
    for (const r of results) {
      if (r.error) result.errors.push(`Update: ${r.error.message}`);
      else result.updated++;
    }
  }

  // Insert new with detail (sequential — typically few new per day)
  for (const c of toInsert) {
    const phone = formatPhone(c.ddd, c.numero);
    const corpId = String(c.codigo);
    let detail;
    try { detail = await getCliente(c.codigo); } catch { result.skipped++; continue; }
    if (!detail) { result.skipped++; continue; }

    const { error } = await sb.from('marpe_contacts').insert({
      name: detail.nome,
      cpf_cnpj: detail.cpf_cnpj || null,
      email: detail.email || null,
      phone,
      city: detail.cidade || null,
      state: detail.estado || 'RS',
      birth_date: parseCorpDate(detail.datanas),
      profession: detail.profissao || null,
      marital_status: detail.estado_civil || null,
      corp_id: corpId,
      source: 'corp_sync',
      address: detail.enderecos?.[0] ? `${detail.enderecos[0].logradouro}, ${detail.enderecos[0].numero}` : null,
    });
    if (error) result.errors.push(`Insert ${c.codigo}: ${error.message}`);
    else result.created++;
  }

  return result;
}

export async function syncDocumentos(datini: string, datfim: string): Promise<SyncResult> {
  const sb = createServerClient();
  const result: SyncResult = { type: 'documents', created: 0, updated: 0, skipped: 0, errors: [] };

  const vendasFunnel = await sb.from('marpe_funnels').select('id').eq('name', 'Vendas').maybeSingle();
  if (!vendasFunnel.data?.id) { result.errors.push('Funnel Vendas not found'); return result; }

  // Emitted-policy stage: 'Emitido' by name, fallback to a won-terminal stage, fallback to last stage
  const stagesRes = await sb.from('marpe_funnel_stages').select('id, name, sort_order, is_terminal, terminal_type')
    .eq('funnel_id', vendasFunnel.data.id).order('sort_order');
  const emitidoStage = stagesRes.data?.find(s => s.name === 'Emitido')
    || stagesRes.data?.find(s => s.terminal_type === 'won')
    || stagesRes.data?.[stagesRes.data.length - 1];
  if (!emitidoStage?.id) { result.errors.push('No stage available for emitted policies'); return result; }

  // Preload contact + deal maps (avoids 2 queries per document)
  const contactMap = new Map<string, string>();
  const dealMap = new Map<string, string>();
  const PAGE_SIZE = 1000;
  for (let page = 0; ; page++) {
    const { data: rows } = await sb.from('marpe_contacts').select('id, corp_id')
      .not('corp_id', 'is', null).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    for (const r of (rows || [])) contactMap.set(r.corp_id, r.id);
    if (!rows || rows.length < PAGE_SIZE) break;
  }
  for (let page = 0; ; page++) {
    const { data: rows } = await sb.from('marpe_deals').select('id, corp_id')
      .like('corp_id', 'doc_%').range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    for (const r of (rows || [])) dealMap.set(r.corp_id, r.id);
    if (!rows || rows.length < PAGE_SIZE) break;
  }

  let pag = 1;
  let total = 0;
  do {
    const { count, documentos } = await listDocumentos({ datini, datfim, pag, qtd_pag: 100 });
    total = count;

    for (const doc of documentos) {
      const corpDealId = `doc_${doc.codfil}_${doc.nosnum}`;
      const contactId = contactMap.get(String(doc.cliente_codigo));
      if (!contactId) { result.skipped++; continue; }

      // Corp-owned data fields — safe to overwrite on every sync
      const corpFields = {
        ramo: doc.ramo?.toLowerCase() || null,
        seguradora: doc.seguradora || null,
        apolice: doc.numapo || null,
        vigencia_inicio: parseCorpDate(doc.inivig),
        vigencia_fim: parseCorpDate(doc.fimvig),
      };

      const existingId = dealMap.get(corpDealId);
      if (existingId) {
        // UPDATE: never reset stage_id/funnel_id/title — kanban position is CRM-managed
        const { error } = await sb.from('marpe_deals')
          .update({ ...corpFields, contact_id: contactId })
          .eq('id', existingId);
        if (error) result.errors.push(`Update doc ${doc.nosnum}: ${error.message}`);
        else result.updated++;
      } else {
        const { error } = await sb.from('marpe_deals').insert({
          ...corpFields,
          contact_id: contactId,
          funnel_id: vendasFunnel.data.id,
          stage_id: emitidoStage.id,
          title: `${doc.ramo} — ${doc.cliente}`,
          deal_type: 'prospeccao',
          corp_id: corpDealId,
        });
        if (error) result.errors.push(`Insert doc ${doc.nosnum}: ${error.message}`);
        else result.created++;
      }
    }

    pag++;
  } while ((pag - 1) * 100 < total);

  return result;
}

// Maps Corp negocio (list item) fields → marpe_deals columns.
// These are the Corp-owned data fields, safe to overwrite on every sync.
function negocioListFields(neg: CorpNegocio): Record<string, any> {
  return {
    ramo: neg.ramo?.toLowerCase() || null,
    premio: neg.val_premio || null,
    comissao_valor: neg.val_c || null,
    tipo_negocio: neg.tipo_neg || null,
    deal_type: neg.tipo_neg?.toLowerCase()?.includes('renova') ? 'renovacao' : 'prospeccao',
    next_action_date: parseCorpDate(neg.prox_aten_data),
    next_action: neg.prox_aten_descricao || null,
    vigencia_inicio: parseCorpDate(neg.inivig),
    vigencia_fim: parseCorpDate(neg.fimvig),
  };
}

// Maps Corp negocio DETAIL fields → marpe_deals columns (Fase 2 fields).
function negocioDetailFields(det: CorpNegocioDetail): Record<string, any> {
  return {
    comissao_pct: det.per_c || null,
    campanha: det.campanha || null,
    seguradora: det.seguradora || null,
    ja_possui_produto: det.produto_ja_possui === 'T',
    seguradora_atual: det.produto_seguradora || null,
    vigencia_atual_fim: parseCorpDate(det.produto_fimvig),
    observacoes_proposta: det.observacoes || null,
    pct_repasse: det.per_r || null,
    valor_repasse: det.val_r || null,
    detalhes_corp: {
      status: det.status,
      etapa: det.etapa,
      prioridade: det.prioridade,
      campo_base_repasse: det.campo_base_r,
      codram: det.codram ?? null,
      codcia: det.codcia ?? null,
      codcamp: det.codcamp ?? null,
      criado_por: det.usuinc,
      criado_em: det.datinc,
      alterado_por: det.usualt,
      alterado_em: det.datalt,
      inicio_negociacao: det.dtini_negociacao,
      codusu_responsavel: det.codusu_responsavel,
      motivo_perda: det.motivo_perda,
      atendimentos: det.atendimentos || [],
    },
  };
}

export async function syncNegocios(opts?: { withDetail?: boolean }): Promise<SyncResult> {
  const withDetail = opts?.withDetail !== false; // default true
  const sb = createServerClient();
  const result: SyncResult = { type: 'negocios', created: 0, updated: 0, skipped: 0, errors: [] };

  const vendasFunnel = await sb.from('marpe_funnels').select('id').eq('name', 'Vendas').maybeSingle();
  if (!vendasFunnel.data?.id) { result.errors.push('Funnel Vendas not found'); return result; }

  // Entry stage: first non-terminal stage by sort_order (stage names are user-editable —
  // never look up by hardcoded name; "Prospecção" was renamed and broke the sync silently)
  const stages = await sb.from('marpe_funnel_stages').select('id, name, sort_order, is_terminal')
    .eq('funnel_id', vendasFunnel.data.id).order('sort_order');
  const entryStage = stages.data?.find(s => !s.is_terminal) || stages.data?.[0];
  if (!entryStage) { result.errors.push('No stages found in Vendas funnel'); return result; }

  // Preload contact + deal maps (avoids 2 queries per negocio)
  const contactMap = new Map<string, string>();
  const dealMap = new Map<string, string>();
  const PAGE_SIZE = 1000;
  for (let page = 0; ; page++) {
    const { data: rows } = await sb.from('marpe_contacts').select('id, corp_id')
      .not('corp_id', 'is', null).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    for (const r of (rows || [])) contactMap.set(r.corp_id, r.id);
    if (!rows || rows.length < PAGE_SIZE) break;
  }
  for (let page = 0; ; page++) {
    const { data: rows } = await sb.from('marpe_deals').select('id, corp_id')
      .like('corp_id', 'neg_%').range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    for (const r of (rows || [])) dealMap.set(r.corp_id, r.id);
    if (!rows || rows.length < PAGE_SIZE) break;
  }

  // Collect all negocios from Corp (paginated)
  const allNegocios: CorpNegocio[] = [];
  let pag = 1;
  let total = 0;
  do {
    const { count, negocios } = await listNegociosAndamento({ pag, qtd_pag: 100 });
    total = count;
    allNegocios.push(...negocios);
    pag++;
  } while ((pag - 1) * 100 < total && pag <= 50);

  // Fetch details in small parallel batches (Corp rate-limit friendly)
  const detailMap = new Map<number, CorpNegocioDetail>();
  if (withDetail) {
    const BATCH = 5;
    for (let i = 0; i < allNegocios.length; i += BATCH) {
      const batch = allNegocios.slice(i, i + BATCH);
      const details = await Promise.all(batch.map(n => getNegocio(n.codigo).catch(() => null)));
      details.forEach((d, idx) => { if (d) detailMap.set(batch[idx].codigo, d); });
    }
  }

  for (const neg of allNegocios) {
    const corpNegId = `neg_${neg.codfil}_${neg.codigo}`;
    const contactId = contactMap.get(String(neg.codcli));
    if (!contactId) { result.skipped++; continue; }

    const detail = detailMap.get(neg.codigo);
    const corpFields = {
      ...negocioListFields(neg),
      ...(detail ? negocioDetailFields(detail) : {}),
    };

    const existingId = dealMap.get(corpNegId);
    if (existingId) {
      // UPDATE: only Corp-owned data fields. NEVER reset stage_id/funnel_id/title —
      // those are managed in the CRM kanban and must survive the sync.
      const { error } = await sb.from('marpe_deals')
        .update({ ...corpFields, contact_id: contactId })
        .eq('id', existingId);
      if (error) result.errors.push(`Update neg ${neg.codigo}: ${error.message}`);
      else result.updated++;
    } else {
      const { error } = await sb.from('marpe_deals').insert({
        ...corpFields,
        contact_id: contactId,
        funnel_id: vendasFunnel.data.id,
        stage_id: entryStage.id,
        title: `${neg.ramo || 'Negócio'} — ${neg.cliente}`,
        corp_id: corpNegId,
      });
      if (error) result.errors.push(`Insert neg ${neg.codigo}: ${error.message}`);
      else result.created++;
    }
  }

  return result;
}

function todayStr(): string {
  return new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function daysAgoStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ── Per-contact real-time sync ────────────────────────────────────────────────
// Syncs a single Corp client's data + their deals/documents immediately.
// Called from the "Sincronizar Corp" button in the UI.
export async function syncContactByCorpId(corpId: number): Promise<{
  contact: SyncResult;
  deals: SyncResult;
  errors: string[];
}> {
  const sb = createServerClient();
  const contactResult: SyncResult = { type: 'contact', created: 0, updated: 0, skipped: 0, errors: [] };
  const dealsResult: SyncResult  = { type: 'deals',   created: 0, updated: 0, skipped: 0, errors: [] };
  const allErrors: string[] = [];

  // ── 1. Contact data ──────────────────────────────────────────────────────────
  let detail: Awaited<ReturnType<typeof getCliente>>;
  try {
    detail = await getCliente(corpId);
  } catch (e: any) {
    allErrors.push(`getCliente: ${e.message}`);
    return { contact: contactResult, deals: dealsResult, errors: allErrors };
  }
  if (!detail) {
    allErrors.push(`Corp client ${corpId} not found`);
    return { contact: contactResult, deals: dealsResult, errors: allErrors };
  }

  // Get phone: detail.telefone first, then search lista_clientes by name
  let phone: string | null = detail.telefone || null;
  if (!phone) {
    try {
      const { clientes } = await listClientes(detail.nome.split(' ')[0]);
      const match = clientes.find(c => c.codigo === corpId);
      if (match) phone = formatPhone(match.ddd, match.numero);
    } catch {}
  }

  // Find existing contact in Supabase
  const { data: existing } = await sb
    .from('marpe_contacts')
    .select('id, phone')
    .eq('corp_id', String(corpId))
    .maybeSingle();

  // Build update payload — never overwrite non-null phone with null
  const contactPayload: Record<string, any> = {
    name: detail.nome,
    email: detail.email || null,
    city: detail.cidade || null,
    state: detail.estado || 'RS',
    corp_id: String(corpId),
    source: 'corp_sync',
    updated_at: new Date().toISOString(),
  };
  if (detail.cpf_cnpj) contactPayload.cpf_cnpj = detail.cpf_cnpj;
  if (detail.datanas)  contactPayload.birth_date = parseCorpDate(detail.datanas);
  if (detail.profissao) contactPayload.profession = detail.profissao;
  if (detail.estado_civil) contactPayload.marital_status = detail.estado_civil;
  if (detail.enderecos?.[0]) {
    const end = detail.enderecos[0];
    contactPayload.address = `${end.logradouro}, ${end.numero}`;
  }
  // Only set phone if Corp has one, or if there's no phone yet in Supabase
  if (phone) {
    contactPayload.phone = phone;
  } else if (existing?.phone) {
    // Keep existing phone — don't include it in the update
  }

  if (existing?.id) {
    const { error } = await sb.from('marpe_contacts').update(contactPayload).eq('id', existing.id);
    if (error) contactResult.errors.push(error.message);
    else contactResult.updated++;
  } else {
    const { error } = await sb.from('marpe_contacts').insert({ ...contactPayload, phone });
    if (error) contactResult.errors.push(error.message);
    else contactResult.created++;
  }

  // Get the contact ID for deal linking
  const { data: contactRow } = await sb
    .from('marpe_contacts')
    .select('id')
    .eq('corp_id', String(corpId))
    .maybeSingle();
  const contactDbId = contactRow?.id;
  if (!contactDbId) {
    allErrors.push('Contact not found in DB after upsert');
    return { contact: contactResult, deals: dealsResult, errors: allErrors };
  }

  // ── 2. Funnels/stages ────────────────────────────────────────────────────────
  const { data: vendasFunnel } = await sb.from('marpe_funnels').select('id').eq('name', 'Vendas').maybeSingle();
  const { data: stagesAll } = await sb.from('marpe_funnel_stages').select('id, name, sort_order, is_terminal, terminal_type')
    .eq('funnel_id', vendasFunnel?.id || '').order('sort_order');
  // Stage names are user-editable — never look up by hardcoded name
  const entryStage = stagesAll?.find(s => !s.is_terminal) || stagesAll?.[0];
  const emitidoStage = stagesAll?.find(s => s.name === 'Emitido')
    || stagesAll?.find(s => s.terminal_type === 'won')
    || stagesAll?.[stagesAll.length - 1];

  // ── 3. Negocios (active negotiations) — filter for this client ───────────────
  if (vendasFunnel?.id && entryStage) {
    try {
      let pag = 1;
      let total = 0;
      do {
        const { count, negocios } = await listNegociosAndamento({ pag, qtd_pag: 100 });
        total = count;
        const mine = negocios.filter(n => n.codcli === corpId);
        for (const neg of mine) {
          const corpNegId = `neg_${neg.codfil}_${neg.codigo}`;
          const { data: existingDeal } = await sb.from('marpe_deals').select('id').eq('corp_id', corpNegId).maybeSingle();

          const detail = await getNegocio(neg.codigo).catch(() => null);
          const corpFields = {
            ...negocioListFields(neg),
            ...(detail ? negocioDetailFields(detail) : {}),
          };

          if (existingDeal?.id) {
            // UPDATE: never reset stage_id/funnel_id/title — kanban position is CRM-managed
            const { error } = await sb.from('marpe_deals')
              .update({ ...corpFields, contact_id: contactDbId })
              .eq('id', existingDeal.id);
            if (error) dealsResult.errors.push(`negocio ${neg.codigo}: ${error.message}`);
            else dealsResult.updated++;
          } else {
            const { error } = await sb.from('marpe_deals').insert({
              ...corpFields,
              contact_id: contactDbId,
              funnel_id: vendasFunnel.id,
              stage_id: entryStage.id,
              title: `${neg.ramo || 'Negócio'} — ${neg.cliente}`,
              corp_id: corpNegId,
            });
            if (error) dealsResult.errors.push(`negocio ${neg.codigo}: ${error.message}`);
            else dealsResult.created++;
          }
        }
        pag++;
      } while ((pag - 1) * 100 < total && pag <= 20); // max 20 pages
    } catch (e: any) {
      dealsResult.errors.push(`negocios: ${e.message}`);
    }
  }

  // ── 4. Documents (last 5 years) — filter for this client ─────────────────────
  if (vendasFunnel?.id && emitidoStage?.id) {
    try {
      const datini = daysAgoStr(365 * 5);
      const datfim = todayStr();
      let pag = 1;
      let total = 0;
      do {
        const { count, documentos } = await listDocumentos({ datini, datfim, pag, qtd_pag: 100 });
        total = count;
        const mine = documentos.filter(d => d.cliente_codigo === corpId);
        for (const doc of mine) {
          const corpDocId = `doc_${doc.codfil}_${doc.nosnum}`;
          const { data: existingDeal } = await sb.from('marpe_deals').select('id').eq('corp_id', corpDocId).maybeSingle();
          const corpFields = {
            ramo: doc.ramo?.toLowerCase() || null,
            seguradora: doc.seguradora || null,
            apolice: doc.numapo || null,
            vigencia_inicio: parseCorpDate(doc.inivig),
            vigencia_fim: parseCorpDate(doc.fimvig),
          };
          if (existingDeal?.id) {
            // UPDATE: never reset stage_id/funnel_id/title — kanban position is CRM-managed
            const { error } = await sb.from('marpe_deals')
              .update({ ...corpFields, contact_id: contactDbId })
              .eq('id', existingDeal.id);
            if (error) dealsResult.errors.push(`doc ${doc.nosnum}: ${error.message}`);
            else dealsResult.updated++;
          } else {
            const { error } = await sb.from('marpe_deals').insert({
              ...corpFields,
              contact_id: contactDbId,
              funnel_id: vendasFunnel.id,
              stage_id: emitidoStage.id,
              title: `${doc.ramo} — ${doc.cliente}`,
              deal_type: 'prospeccao',
              corp_id: corpDocId,
            });
            if (error) dealsResult.errors.push(`doc ${doc.nosnum}: ${error.message}`);
            else dealsResult.created++;
          }
        }
        pag++;
      } while ((pag - 1) * 100 < total && pag <= 50); // max 50 pages (5000 docs)
    } catch (e: any) {
      dealsResult.errors.push(`documentos: ${e.message}`);
    }
  }

  allErrors.push(...contactResult.errors, ...dealsResult.errors);
  return { contact: contactResult, deals: dealsResult, errors: allErrors };
}

export async function syncAll(): Promise<SyncResult[]> {
  const sb = createServerClient();
  const startedAt = new Date().toISOString();
  const results: SyncResult[] = [];

  // Sync window: last 60 days → today
  const datini = daysAgoStr(60);
  const datfim = todayStr();

  results.push(await syncClientes());
  results.push(await syncDocumentos(datini, datfim));
  results.push(await syncNegocios());

  // Log to marpe_corp_sync_log
  for (const r of results) {
    await sb.from('marpe_corp_sync_log').insert({
      sync_type: r.type,
      status: r.errors.length ? 'partial' : 'success',
      records_created: r.created,
      records_updated: r.updated,
      records_skipped: r.skipped,
      error_message: r.errors.length ? r.errors.slice(0, 5).join('; ') : null,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
    });
  }

  return results;
}
